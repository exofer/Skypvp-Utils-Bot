import { fetch, Agent } from 'undici';
import type { Redis } from 'ioredis';
import { CACHE_TTL, RATE_LIMITS } from '../config/constants.js';
import { createLogger } from '../utils/logger.js';
import { ApiError } from '../utils/errors.js';
import type { z } from 'zod';

const log = createLogger('pika-api-client');

export class PikaApiClient {
  private baseUrl: string;
  private apiKey: string;
  private redis: Redis;
  private agent: Agent;

  // In-flight request deduplication
  private inFlight = new Map<string, Promise<any>>();

  // Sliding window rate limiter state
  private requestTimestamps: number[] = [];

  constructor(apiKey: string, baseUrl: string, redis: Redis) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.redis = redis;
    this.agent = new Agent({
      keepAliveTimeout: 60000,
      keepAliveMaxTimeout: 600000,
      pipelining: 1,
      connections: 10,
    });
  }

  /**
   * Internal rate limit check to keep requests <= TARGET_PER_MINUTE
   */
  private async throttle(): Promise<void> {
    const now = Date.now();
    // Keep timestamps from the last 60 seconds
    this.requestTimestamps = this.requestTimestamps.filter((t) => now - t < 60000);

    if (this.requestTimestamps.length >= RATE_LIMITS.PIKA_API_TARGET_PER_MINUTE) {
      const oldest = this.requestTimestamps[0]!;
      const waitTime = Math.max(100, 60000 - (now - oldest) + 50);
      log.debug({ waitTime, currentCount: this.requestTimestamps.length }, 'Proactively throttling API request');
      await new Promise((r) => setTimeout(r, waitTime));
    }

    this.requestTimestamps.push(Date.now());
  }

  /**
   * Generic GET request with caching, deduplication, retry, and validation.
   */
  public async get<T>(
    endpoint: string,
    schema?: z.ZodTypeAny,
    ttlSeconds: number = CACHE_TTL.API_DEFAULT
  ): Promise<T> {
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const cacheKey = `pika:cache:${normalizedEndpoint}`;

    // 1. Check Redis cache
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        log.debug({ endpoint: normalizedEndpoint }, 'Cache HIT');
        return JSON.parse(cached) as T;
      }
    } catch (err: any) {
      log.warn({ err: err?.message }, 'Redis cache read error, proceeding to fetch');
    }

    // 2. Request deduplication (in-flight)
    if (this.inFlight.has(normalizedEndpoint)) {
      log.debug({ endpoint: normalizedEndpoint }, 'Joining in-flight request');
      return this.inFlight.get(normalizedEndpoint) as Promise<T>;
    }

    const fetchPromise = this.executeWithRetry<T>(normalizedEndpoint, schema, ttlSeconds, cacheKey);
    this.inFlight.set(normalizedEndpoint, fetchPromise);

    try {
      return await fetchPromise;
    } finally {
      this.inFlight.delete(normalizedEndpoint);
    }
  }

  private async executeWithRetry<T>(
    endpoint: string,
    schema: z.ZodTypeAny | undefined,
    ttlSeconds: number,
    cacheKey: string,
    attempt = 1
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const maxAttempts = 3;

    await this.throttle();

    log.debug({ endpoint, attempt }, 'Fetching from PikaNetwork API');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method: 'GET',
        dispatcher: this.agent,
        headers: {
          'X-Api-Key': this.apiKey,
          Accept: 'application/json',
          'User-Agent': 'SkyPvP-Utils-DiscordBot/1.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle 429 Rate Limit
      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : 3000;
        log.warn({ endpoint, retryAfter, attempt }, 'Hit 429 Too Many Requests from PikaNetwork');

        if (attempt <= maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, retryAfter));
          return this.executeWithRetry<T>(endpoint, schema, ttlSeconds, cacheKey, attempt + 1);
        }
        throw new ApiError('PikaNetwork API rate limit exceeded. Please try again shortly.', endpoint, 429);
      }

      // Handle 404
      if (response.status === 404) {
        throw new ApiError(`Resource not found on PikaNetwork: ${endpoint}`, endpoint, 404);
      }

      // Handle 5xx server errors with backoff retry
      if (response.status >= 500) {
        if (attempt <= maxAttempts) {
          const delay = Math.pow(2, attempt) * 1000;
          log.warn({ endpoint, status: response.status, attempt, delay }, 'PikaNetwork API server error, retrying');
          await new Promise((r) => setTimeout(r, delay));
          return this.executeWithRetry<T>(endpoint, schema, ttlSeconds, cacheKey, attempt + 1);
        }
        throw new ApiError(`PikaNetwork API unavailable (Status: ${response.status})`, endpoint, response.status);
      }

      if (!response.ok) {
        throw new ApiError(`PikaNetwork API returned status ${response.status}`, endpoint, response.status);
      }

      const json = await response.json();

      let validatedData: T = json as T;
      if (schema) {
        const parseResult = schema.safeParse(json);
        if (!parseResult.success) {
          log.error({ endpoint, issues: parseResult.error.issues }, 'Schema validation mismatch on API response');
          // Still fallback to raw json to prevent crash on non-breaking schema additions
          validatedData = json as T;
        } else {
          validatedData = parseResult.data;
        }
      }

      // Cache successful response in Redis
      try {
        await this.redis.set(cacheKey, JSON.stringify(validatedData), 'EX', ttlSeconds);
      } catch (err: any) {
        log.warn({ err: err?.message }, 'Failed to write cache to Redis');
      }

      return validatedData;
    } catch (err: any) {
      if (err instanceof ApiError) throw err;

      // In case of network downtime, try to serve stale cache
      try {
        const stale = await this.redis.get(cacheKey);
        if (stale) {
          log.warn({ endpoint }, 'Network error; serving cached data from Redis as fallback');
          return JSON.parse(stale) as T;
        }
      } catch (_) {}

      throw new ApiError(`Failed to communicate with PikaNetwork API: ${err.message}`, endpoint, 500);
    }
  }
}
