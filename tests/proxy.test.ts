import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import http from 'node:http';
import net from 'node:net';
import {
  maskProxyUrl,
  parseProxyUrl,
  createProxySocket,
  testProxyConnection,
} from '../src/mineflayer/proxy.js';

describe('Mineflayer Proxy System', () => {
  describe('maskProxyUrl', () => {
    it('masks password in SOCKS5 URLs with authentication', () => {
      const url = 'socks5://admin:MySecretPassword123@192.168.1.100:1080';
      const masked = maskProxyUrl(url);
      expect(masked).toBe('socks5://admin:***@192.168.1.100:1080');
      expect(masked).not.toContain('MySecretPassword123');
    });

    it('masks password in HTTP proxy URLs with authentication', () => {
      const url = 'http://proxyuser:SuperP@ssword!@proxy.example.com:8080';
      const masked = maskProxyUrl(url);
      expect(masked).toContain('proxyuser:***@proxy.example.com:8080');
      expect(masked).not.toContain('SuperP@ssword!');
    });

    it('leaves unauthenticated proxy URLs unchanged', () => {
      const url = 'socks5://10.0.0.1:1080';
      expect(maskProxyUrl(url)).toBe('socks5://10.0.0.1:1080');
    });

    it('safely handles empty or non-string inputs', () => {
      expect(maskProxyUrl('')).toBe('');
      expect(maskProxyUrl(null as any)).toBe('');
      expect(maskProxyUrl(undefined as any)).toBe('');
    });
  });

  describe('parseProxyUrl', () => {
    it('parses valid SOCKS5 URL', () => {
      const parsed = parseProxyUrl('socks5://bob:secret@proxy.host.net:1080');
      expect(parsed.protocol).toBe('socks5');
      expect(parsed.host).toBe('proxy.host.net');
      expect(parsed.port).toBe(1080);
      expect(parsed.username).toBe('bob');
      expect(parsed.password).toBe('secret');
    });

    it('parses SOCKS4 URL with default port', () => {
      const parsed = parseProxyUrl('socks4://proxy.host.net');
      expect(parsed.protocol).toBe('socks4');
      expect(parsed.host).toBe('proxy.host.net');
      expect(parsed.port).toBe(1080);
      expect(parsed.username).toBeUndefined();
    });

    it('parses HTTP proxy URL', () => {
      const parsed = parseProxyUrl('http://myproxy.org:3128');
      expect(parsed.protocol).toBe('http');
      expect(parsed.host).toBe('myproxy.org');
      expect(parsed.port).toBe(3128);
    });

    it('throws on unsupported protocols', () => {
      expect(() => parseProxyUrl('ftp://1.2.3.4:21')).toThrow('Unsupported proxy protocol');
      expect(() => parseProxyUrl('ssh://1.2.3.4:22')).toThrow('Unsupported proxy protocol');
    });

    it('throws on empty or invalid URLs', () => {
      expect(() => parseProxyUrl('')).toThrow('Proxy URL cannot be empty');
      expect(() => parseProxyUrl('not_a_valid_url')).toThrow('Invalid proxy URL format');
    });
  });

  describe('Live Socket Proxying (HTTP CONNECT)', () => {
    let mockTargetServer: net.Server;
    let targetPort: number;
    let mockHttpProxy: http.Server;
    let proxyPort: number;

    beforeAll(async () => {
      // 1. Mock destination server
      mockTargetServer = net.createServer((socket) => {
        socket.on('data', (d) => {
          if (d.toString().trim() === 'PING') {
            socket.write('PONG\n');
          }
        });
      });

      await new Promise<void>((resolve) => {
        mockTargetServer.listen(0, '127.0.0.1', () => {
          targetPort = (mockTargetServer.address() as net.AddressInfo).port;
          resolve();
        });
      });

      // 2. Mock HTTP CONNECT Proxy server
      mockHttpProxy = http.createServer();
      mockHttpProxy.on('connect', (req, clientSocket, head) => {
        const [host, port] = req.url!.split(':');
        const srvSocket = net.connect(Number(port), host!, () => {
          clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          if (head && head.length > 0) {
            srvSocket.write(head);
          }
          srvSocket.pipe(clientSocket);
          clientSocket.pipe(srvSocket);
        });
        srvSocket.on('error', () => clientSocket.destroy());
        clientSocket.on('error', () => srvSocket.destroy());
      });

      await new Promise<void>((resolve) => {
        mockHttpProxy.listen(0, '127.0.0.1', () => {
          proxyPort = (mockHttpProxy.address() as net.AddressInfo).port;
          resolve();
        });
      });
    });

    afterAll(async () => {
      mockTargetServer.closeAllConnections?.();
      mockHttpProxy.closeAllConnections?.();
      await new Promise((resolve) => mockTargetServer.close(resolve));
      await new Promise((resolve) => mockHttpProxy.close(resolve));
    });

    it('establishes TCP connection through HTTP CONNECT proxy and transmits data', async () => {
      const proxyUrl = `http://127.0.0.1:${proxyPort}`;
      const socket = await createProxySocket(proxyUrl, '127.0.0.1', targetPort);

      expect(socket).toBeDefined();

      const received = await new Promise<string>((resolve) => {
        socket.once('data', (data) => {
          resolve(data.toString());
        });
        socket.write('PING');
      });

      expect(received).toContain('PONG');
      socket.destroy();
    });

    it('testProxyConnection reports success and latency for working proxy', async () => {
      const proxyUrl = `http://127.0.0.1:${proxyPort}`;
      const result = await testProxyConnection(proxyUrl, '127.0.0.1', targetPort);

      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.protocol).toBe('http');
    });

    it('testProxyConnection reports failure when destination is unreachable', async () => {
      const proxyUrl = `http://127.0.0.1:${proxyPort}`;
      // Point to an invalid target port
      const result = await testProxyConnection(proxyUrl, '127.0.0.1', 59999, 1000);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Live Socket Proxying (SOCKS5)', () => {
    let mockSocksServer: net.Server;
    let socksPort: number;

    beforeAll(async () => {
      // Minimal RFC 1928 SOCKS5 Mock Server
      mockSocksServer = net.createServer((socket) => {
        let state = 'AUTH';
        socket.on('data', () => {
          if (state === 'AUTH') {
            // Version 5, Method 0 (no auth)
            socket.write(Buffer.from([0x05, 0x00]));
            state = 'CONNECT';
          } else if (state === 'CONNECT') {
            // Version 5, Reply 0 (success), Reserved 0, IPv4 (1), 127.0.0.1:0
            socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0x00, 0x00]));
            state = 'DATA';
            socket.write('SOCKS5_MOCK_SUCCESS');
          }
        });
      });

      await new Promise<void>((resolve) => {
        mockSocksServer.listen(0, '127.0.0.1', () => {
          socksPort = (mockSocksServer.address() as net.AddressInfo).port;
          resolve();
        });
      });
    });

    afterAll(async () => {
      mockSocksServer.closeAllConnections?.();
      await new Promise((resolve) => mockSocksServer.close(resolve));
    });

    it('connects through SOCKS5 proxy and exchanges payload', async () => {
      const proxyUrl = `socks5://127.0.0.1:${socksPort}`;
      const socket = await createProxySocket(proxyUrl, 'example.com', 80);

      expect(socket).toBeDefined();

      const received = await new Promise<string>((resolve) => {
        socket.once('data', (data) => {
          resolve(data.toString());
        });
      });

      expect(received).toBe('SOCKS5_MOCK_SUCCESS');
      socket.destroy();
    });
  });
});
