import dns from 'node:dns/promises';
import net from 'node:net';
import mcProtocol from 'minecraft-protocol';
import mineflayer from 'mineflayer';
import { prisma } from '../src/db/prisma.js';
import { mineflayerSecurity } from '../src/mineflayer/security.js';
import { parseDisconnectReason } from '../src/mineflayer/client.js';
import { maskProxyUrl, testProxyConnection, createMineflayerProxyConnect } from '../src/mineflayer/proxy.js';
import { env } from '../src/config/env.js';

async function runDiagnostic() {
  console.log('=====================================================');
  console.log('   SKYPVP UTILS — MINEFLAYER CONNECTION DIAGNOSTIC   ');
  console.log('=====================================================\n');

  // 1. Credential & Proxy Decryption
  console.log('[1/5] Checking stored credentials, proxy settings, and encryption key...');
  const configs = await prisma.mineflayerAccountConfig.findMany();
  let activeProxy: string | null = null;

  if (configs.length === 0) {
    console.log('  ⚠️  No Mineflayer bot accounts configured in database.');
    console.log('      Configure one in Discord via /owneraccount configure <username> [password]\n');
  } else {
    for (const cfg of configs) {
      console.log(`  • Guild: ${cfg.guildId} (enabled: ${cfg.enabled})`);
      const validation = await mineflayerSecurity.validateCredentials(cfg.guildId);
      if (validation.valid) {
        console.log(`    ✅ Decryption SUCCESS: username="${validation.username}"`);
      } else {
        console.log(`    ❌ Decryption FAILED: ${validation.error}`);
      }

      const proxy = await mineflayerSecurity.getProxy(cfg.guildId);
      if (proxy) {
        activeProxy = proxy;
        console.log(`    🛡️  Proxy configured: ${maskProxyUrl(proxy)}`);
      }
    }
  }

  if (!activeProxy && env.MINEFLAYER_PROXY_URL) {
    activeProxy = env.MINEFLAYER_PROXY_URL;
    console.log(`  🛡️  Proxy configured via .env: ${maskProxyUrl(activeProxy)}`);
  }

  if (!activeProxy) {
    console.log('  ℹ️  No proxy configured (using direct TCP connection)');
  }
  console.log();

  // 2. DNS & SRV Resolution
  const host = env.MINEFLAYER_HOST;
  const port = env.MINEFLAYER_PORT;
  console.log(`[2/5] Resolving DNS for ${host}:${port}...`);
  try {
    const srv = await dns.resolveSrv(`_minecraft._tcp.${host}`).catch(() => null);
    if (srv && srv.length > 0) {
      console.log(`  • SRV Record: ${srv[0].name}:${srv[0].port} (priority: ${srv[0].priority}, weight: ${srv[0].weight})`);
    } else {
      console.log('  • SRV Record: None found (direct host/port in use)');
    }

    const aRecords = await dns.resolve4(host).catch((e) => [`IPv4 Error: ${e.message}`]);
    console.log(`  • IPv4 (A): ${aRecords.join(', ')}`);

    const aaaaRecords = await dns.resolve6(host).catch(() => []);
    if (aaaaRecords.length > 0) {
      console.log(`  • IPv6 (AAAA): ${aaaaRecords.join(', ')}`);
    }
    console.log();
  } catch (err: any) {
    console.log(`  ❌ DNS Error: ${err.message}\n`);
  }

  // 3. TCP Connect & Latency
  console.log(`[3/5] Testing TCP socket connectivity to ${host}:${port}...`);
  await new Promise<void>((resolve) => {
    const start = Date.now();
    const socket = net.createConnection({ host, port }, () => {
      const elapsed = Date.now() - start;
      console.log(`  ✅ TCP Connection established in ${elapsed}ms\n`);
      socket.end();
      resolve();
    });
    socket.setTimeout(6000);
    socket.on('timeout', () => {
      console.log(`  ❌ TCP Connection timed out after 6000ms\n`);
      socket.destroy();
      resolve();
    });
    socket.on('error', (err: any) => {
      console.log(`  ❌ TCP Socket Error: ${err.message} (${err.code})\n`);
      resolve();
    });
  });

  // 4. Server List Ping (SLP) Handshake
  console.log(`[4/5] Testing Minecraft Server List Ping (SLP handshake)...`);
  await new Promise<void>((resolve) => {
    const start = Date.now();
    let resolved = false;
    const done = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };
    const timer = setTimeout(() => {
      console.log(`  ⏱️  SLP Ping timed out after 5000ms\n`);
      done();
    }, 5000);

    mcProtocol.ping({ host, port, closeTimeout: 4000 }, (err, result) => {
      clearTimeout(timer);
      const elapsed = Date.now() - start;
      if (err) {
        console.log(`  ❌ SLP Ping failed in ${elapsed}ms: ${err.message}\n`);
      } else {
        const ver = typeof result?.version === 'object' ? `${result.version.name} (protocol ${result.version.protocol})` : String(result?.version);
        const players = result?.players ? `${result.players.online}/${result.players.max}` : 'N/A';
        console.log(`  ✅ SLP Ping successful in ${elapsed}ms:`);
        console.log(`     - Server Version: ${ver}`);
        console.log(`     - Online Players: ${players}\n`);
      }
      done();
    });
  });

  // 5. Test Bot Login
  console.log(`[5/5] Testing Mineflayer protocol login...`);
  let testUser = 'jartexlockedin67';
  if (configs.length > 0) {
    const c = await mineflayerSecurity.getCredentials(configs[0].guildId);
    if (c?.username) testUser = c.username;
  }

  if (activeProxy) {
    console.log(`  • Testing proxy tunnel to ${host}:${port} via ${maskProxyUrl(activeProxy)}...`);
    const proxyCheck = await testProxyConnection(activeProxy, host, port);
    if (proxyCheck.success) {
      console.log(`    ✅ Proxy tunnel established in ${proxyCheck.latencyMs}ms (${proxyCheck.protocol.toUpperCase()})`);
    } else {
      console.log(`    ❌ Proxy tunnel test failed: ${proxyCheck.error}`);
    }
  }

  const routeLabel = activeProxy ? `via proxy ${maskProxyUrl(activeProxy)}` : 'via direct TCP';
  console.log(`  • Connecting test bot as "${testUser}" (${routeLabel})...`);
  await new Promise<void>((resolve) => {
    const start = Date.now();
    const botOptions: any = {
      host,
      port,
      username: testUser,
      auth: 'offline',
      version: '1.20.4',
      hideErrors: false,
    };

    if (activeProxy) {
      botOptions.connect = createMineflayerProxyConnect(activeProxy, host, port);
    }

    const bot = mineflayer.createBot(botOptions);

    const timer = setTimeout(() => {
      console.log(`  ⏱️  Test bot 12s timeout reached`);
      bot.quit();
      resolve();
    }, 12000);

    const client = (bot as any)._client;
    if (client) {
      client.on('state', (newState: string, oldState: string) => {
        console.log(`  [+${Date.now() - start}ms] Protocol state: ${oldState} -> ${newState}`);
      });
      client.on('disconnect', (pkt: any) => {
        const reason = parseDisconnectReason(pkt);
        console.log(`  [+${Date.now() - start}ms] Disconnect packet: "${reason}"`);
      });
      client.on('kick_disconnect', (pkt: any) => {
        const reason = parseDisconnectReason(pkt);
        console.log(`  [+${Date.now() - start}ms] Kick_disconnect packet: "${reason}"`);
      });
    }

    bot.on('login', () => {
      console.log(`  [+${Date.now() - start}ms] ✅ Bot login event fired`);
    });

    bot.on('spawn', () => {
      console.log(`  [+${Date.now() - start}ms] ✅ Bot spawned into world at:`, bot.entity?.position);
      clearTimeout(timer);
      setTimeout(() => {
        bot.quit();
        resolve();
      }, 1000);
    });

    bot.on('kicked', (reason) => {
      console.log(`  [+${Date.now() - start}ms] ⚠️ Bot kicked:`, parseDisconnectReason(reason));
      clearTimeout(timer);
      resolve();
    });

    bot.on('end', (reason) => {
      console.log(`  [+${Date.now() - start}ms] Bot connection ended: ${reason}`);
      clearTimeout(timer);
      resolve();
    });

    bot.on('error', (err) => {
      console.log(`  [+${Date.now() - start}ms] Bot error: ${err.message}`);
    });
  });

  console.log('\nDiagnostic complete.\n');
  process.exit(0);
}

runDiagnostic().catch((e) => {
  console.error('Diagnostic error:', e);
  process.exit(1);
});
