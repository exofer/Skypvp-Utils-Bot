import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import { SocksClient, type SocksClientOptions } from 'socks';
import { createLogger } from '../utils/logger.js';

const log = createLogger('mineflayer-proxy');

export interface ParsedProxyConfig {
  protocol: 'socks5' | 'socks4' | 'http' | 'https';
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface ProxyTestResult {
  success: boolean;
  latencyMs: number;
  maskedUrl: string;
  protocol: string;
  error?: string;
}

/**
 * Mask proxy credentials for safe logging and status displays.
 * e.g. "socks5://user:secret@1.2.3.4:1080" -> "socks5://user:***@1.2.3.4:1080"
 */
export function maskProxyUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    // Regex fallback if URL is slightly malformed
    return trimmed.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
  }
}

/**
 * Validate and parse proxy URL
 */
export function parseProxyUrl(rawUrl: string): ParsedProxyConfig {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('Proxy URL cannot be empty');
  }

  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid proxy URL format: "${maskProxyUrl(trimmed)}". Expected format: socks5://user:pass@host:port or http://host:port`);
  }

  const rawProtocol = parsed.protocol.replace(':', '').toLowerCase();
  let protocol: 'socks5' | 'socks4' | 'http' | 'https';

  if (rawProtocol === 'socks5' || rawProtocol === 'socks' || rawProtocol === 'socks5h') {
    protocol = 'socks5';
  } else if (rawProtocol === 'socks4' || rawProtocol === 'socks4a') {
    protocol = 'socks4';
  } else if (rawProtocol === 'http') {
    protocol = 'http';
  } else if (rawProtocol === 'https') {
    protocol = 'https';
  } else {
    throw new Error(`Unsupported proxy protocol "${rawProtocol}". Supported protocols: socks5://, socks4://, http://, https://`);
  }

  if (!parsed.hostname) {
    throw new Error('Proxy URL must specify a valid hostname or IP address');
  }

  const defaultPort = protocol === 'http' ? 8080 : protocol === 'https' ? 443 : 1080;
  const port = parsed.port ? parseInt(parsed.port, 10) : defaultPort;

  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid proxy port: "${parsed.port}"`);
  }

  return {
    protocol,
    host: parsed.hostname,
    port,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
  };
}

/**
 * Resolve Minecraft SRV record if present, otherwise fallback to direct host & port
 */
export async function resolveMinecraftDestination(
  host: string,
  port: number
): Promise<{ host: string; port: number }> {
  if (port === 25565 && net.isIP(host) === 0 && host !== 'localhost') {
    try {
      const addresses = await dns.resolveSrv(`_minecraft._tcp.${host}`);
      if (addresses && addresses.length > 0 && addresses[0]?.name && addresses[0]?.port) {
        log.debug(
          { original: `${host}:${port}`, resolved: `${addresses[0].name}:${addresses[0].port}` },
          'Resolved Minecraft SRV record for proxy target'
        );
        return {
          host: addresses[0].name,
          port: addresses[0].port,
        };
      }
    } catch {
      // SRV resolution failed or no record; use host & port directly
    }
  }

  return { host, port };
}

/**
 * Create a SOCKS (v4/v5) socket tunnel to target destination
 */
async function createSocksSocket(
  config: ParsedProxyConfig,
  targetHost: string,
  targetPort: number,
  timeoutMs = 12000
): Promise<net.Socket> {
  const options: SocksClientOptions = {
    proxy: {
      host: config.host,
      port: config.port,
      type: config.protocol === 'socks4' ? 4 : 5,
      userId: config.username,
      password: config.password,
    },
    command: 'connect',
    destination: {
      host: targetHost,
      port: targetPort,
    },
    timeout: timeoutMs,
  };

  const info = await SocksClient.createConnection(options);
  return info.socket;
}

/**
 * Create an HTTP CONNECT socket tunnel to target destination
 */
function createHttpConnectSocket(
  config: ParsedProxyConfig,
  targetHost: string,
  targetPort: number,
  timeoutMs = 12000
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const isHttps = config.protocol === 'https';
    const httpLib = isHttps ? https : http;

    const headers: Record<string, string> = {
      Host: `${targetHost}:${targetPort}`,
    };

    if (config.username) {
      const auth = config.password ? `${config.username}:${config.password}` : config.username;
      headers['Proxy-Authorization'] = `Basic ${Buffer.from(auth).toString('base64')}`;
    }

    const req = httpLib.request({
      host: config.host,
      port: config.port,
      method: 'CONNECT',
      path: `${targetHost}:${targetPort}`,
      headers,
    });

    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        req.destroy(new Error(`HTTP proxy connection timed out after ${timeoutMs}ms`));
        reject(new Error(`HTTP proxy connection timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    req.on('connect', (res, socket, head) => {
      if (settled) {
        socket.destroy();
        return;
      }
      settled = true;
      clearTimeout(timer);

      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        if (head && head.length > 0) {
          socket.unshift(head);
        }
        resolve(socket as net.Socket);
      } else {
        socket.destroy();
        reject(
          new Error(
            `HTTP proxy CONNECT failed with status ${res.statusCode} (${res.statusMessage || 'Proxy Rejected'})`
          )
        );
      }
    });

    req.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    req.end();
  });
}

/**
 * Establish a connected net.Socket through the configured proxy to target destination
 */
export async function createProxySocket(
  proxyUrl: string,
  targetHost: string,
  targetPort: number,
  timeoutMs = 12000
): Promise<net.Socket> {
  const config = parseProxyUrl(proxyUrl);

  if (config.protocol === 'socks5' || config.protocol === 'socks4') {
    return createSocksSocket(config, targetHost, targetPort, timeoutMs);
  } else {
    return createHttpConnectSocket(config, targetHost, targetPort, timeoutMs);
  }
}

/**
 * Creates a Mineflayer / node-minecraft-protocol custom connect function
 * that tunnels the connection through the specified proxy
 */
export function createMineflayerProxyConnect(proxyUrl: string, host: string, port: number) {
  const masked = maskProxyUrl(proxyUrl);

  return (client: any) => {
    resolveMinecraftDestination(host, port)
      .then(async (dest) => {
        log.info(
          {
            proxy: masked,
            destination: `${dest.host}:${dest.port}`,
            virtualHost: `${host}:${port}`,
          },
          'Connecting to Minecraft server via proxy'
        );

        const socket = await createProxySocket(proxyUrl, dest.host, dest.port);

        if (socket.setNoDelay) socket.setNoDelay(true);
        if (socket.setKeepAlive) socket.setKeepAlive(true, 10000);

        // Hand over socket to protocol client
        client.setSocket(socket);

        // Because proxy socket is already established, trigger connect event
        // so client/setProtocol.js emits set_protocol handshake & login_start
        client.emit('connect');
      })
      .catch((err: any) => {
        log.error({ proxy: masked, err: err?.message }, 'Failed to establish connection via proxy');
        client.emit('error', new Error(`Proxy connection error: ${err?.message || 'Unknown proxy error'}`));
        client.emit('end', 'proxyConnectionFailed');
      });
  };
}

/**
 * Test proxy connectivity and latency to a destination
 */
export async function testProxyConnection(
  proxyUrl: string,
  targetHost = 'play.pika-network.net',
  targetPort = 25565,
  timeoutMs = 8000
): Promise<ProxyTestResult> {
  const maskedUrl = maskProxyUrl(proxyUrl);
  const start = Date.now();

  try {
    const config = parseProxyUrl(proxyUrl);
    const dest = await resolveMinecraftDestination(targetHost, targetPort);
    const socket = await createProxySocket(proxyUrl, dest.host, dest.port, timeoutMs);

    const latencyMs = Date.now() - start;
    socket.destroy();

    return {
      success: true,
      latencyMs,
      maskedUrl,
      protocol: config.protocol,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    return {
      success: false,
      latencyMs,
      maskedUrl,
      protocol: 'unknown',
      error: err?.message || 'Unknown proxy error',
    };
  }
}
