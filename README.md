# SkyPvP Utils — Production Discord Bot

Production-ready Discord utility bot designed specifically for **PikaNetwork SkyPvP**.

---

## ⚡ Features

- **Player Statistics & Profiles**: Deep stats (kills, deaths, KDR, streaks, bounty, wins, losses), side-by-side player comparisons, daily movers, and historical progress.
- **Player Tracking**: Periodic snapshot polling with delta stat tracking (e.g., `+12 kills`, `+2 deaths`).
- **Auction System**:
  - Modular `AuctionProvider` architecture.
  - In-game `/ah` GUI scraping via Mineflayer bot.
  - Public auction feed channel with clean embeds and deduplication.
  - Personal auction watches with max-price thresholds and private DM alerts.
- **SkyPvP Events**: 6 tracked events (*Floral Fortune, Envoy Drops, Blood Lust, Gold Rush, Hard Point, KOTL*) with **individual role pings** and dedup.
- **KOTH Monitoring**: East & West KOTH with a single shared role ping on start and capture.
- **Stronghold Alerts**: Dedicated Stronghold channel and role pings.
- **Outpost Monitoring**: Four outposts (*Souls, Damage, Resistance, Luckyblocks*) displayed on a live, continuously updated board with **ZERO role pings**.
- **One-Way Chat Bridge**: Strictly Minecraft ➔ Discord public chat forwarding (no Discord-to-Minecraft messaging).
- **Mineflayer Integration**: Offline/cracked authentication, AES-256-GCM encrypted credentials at rest, interactive observation.
- **Three-Tier Permissions**: Public, Admin, and Owner commands verified on the backend.
- **Global Public Toggle**: Instantly disable/enable public commands via `/ownersettings public-commands`.
- **13-Category Discord Logging**: Configurable destination channels for commands, audit logs, API, auction, and system events.
- **Professional `/updatelogs`**: Interactive release notes generator with modal inputs, confirmation workflow, and message link.

---

## 🛠️ Technology Stack

- **Node.js 22+** with **TypeScript** (Strict Mode)
- **Discord.js v14**
- **PostgreSQL** + **Prisma ORM**
- **Redis** + **BullMQ** (Background job queues)
- **Mineflayer** (Interactive `/ah` and game monitoring)
- **Zod** (Schema validation)
- **Pino** (Structured JSON logging)
- **Vitest** (Automated testing)
- **Docker & Docker Compose**

---

## 🚀 Deployment Guide (VPS / Server)

### 1. Prerequisites
Ensure Docker, Docker Compose, and Node.js 22+ are installed on your server:
```bash
node -v # Should be >= 22
docker --version
docker compose version
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in the required values:
- `DISCORD_TOKEN`: Bot token from Discord Developer Portal
- `DISCORD_APP_ID`: Application client ID
- `DISCORD_OWNER_ID`: Your personal Discord User ID
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `PIKA_API_KEY`: PikaNetwork API key (obtain in-game via `/apikey`)
- `ENCRYPTION_KEY`: 64-character hexadecimal key (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)

### 3. Create Discord Application & Bot
1. Go to [Discord Developer Portal](https://discord.com/developers/applications).
2. Create an Application, then create a Bot under the **Bot** tab.
3. Enable **Privileged Gateway Intents**:
   - `Server Members Intent`
   - `Message Content Intent`
4. Invite the bot using OAuth2 URL Generator with `bot` + `applications.commands` scopes and Administrator permissions.

### 4. Deploy with Docker Compose
Run the entire stack (Bot + PostgreSQL + Redis) with a single command:
```bash
docker compose up -d --build
```

### 5. Run Database Migrations
```bash
docker compose exec bot npx prisma migrate deploy
```

### 6. Register Slash Commands
Deploy slash commands to Discord:
```bash
docker compose exec bot npm run commands:register
```

### 7. View Live Logs
```bash
docker compose logs -f bot
```

---

## ⚙️ In-Discord Initial Setup

1. **Configure Channels**:
   - Use `/setup` to view the server setup overview.
   - Run `/auctionfeed channel target:#auctions` to set the public auction feed.
   - Run `/ownerevents channel target:#events` to set the event notification channel.
   - Run `/ownerkoth channel target:#koth` to set the KOTH channel.
   - Run `/ownerstronghold channel target:#stronghold` to set the Stronghold channel.
   - Run `/owneroutpost channel target:#outposts` to set up the live outpost board.
   - Run `/ownerchat channel target:#minecraft-chat` to configure the chat bridge.
   - Run `/ownerupdates channel target:#announcements` for release logs.

2. **Configure Role Pings**:
   - Run `/ownerevents role event:Floral Fortune target_role:@Floral`
   - Run `/ownerkoth role target_role:@KOTH` (shared for East and West)
   - Run `/ownerstronghold role target_role:@Stronghold`

3. **Connect Mineflayer Observation Bot**:
   - Run `/account configure username:<bot_username> password:<optional_pwd>`
   - Run `/account test` to connect the bot to PikaNetwork SkyPvP and begin `/ah` scanning.

---

## 🔒 Security Best Practices

- All passwords and credentials stored in PostgreSQL are encrypted with **AES-256-GCM**.
- Slash commands, buttons, and modals verify permissions on the backend using exact Discord IDs.
- Admins never receive owner privileges.
- Public commands can be toggled off server-wide at any time with `/ownersettings public-commands false`.

---

## 🧪 Testing

Run the full automated Vitest test suite:
```bash
npm test
```
