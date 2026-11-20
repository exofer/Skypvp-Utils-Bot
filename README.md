# SkyPvP Utils — Production Discord Bot

Production-ready, high-performance Discord utility bot built specifically for **PikaNetwork SkyPvP**.

---

## ⚡ Overview & Features

SkyPvP Utils is an advanced telemetry, monitoring, and statistics bot tailored for competitive PikaNetwork SkyPvP players, clan leaders, and server administrators.

### Core Systems
- **Player Profiles & Statistics**:
  - Live combat summary: kills, deaths, K/D ratio, current and best streaks, bounty, tournament wins.
  - In-game balance lookup (`/bal <username>`) and server-wide balance leaderboards (`/baltop`, `/baltops`).
  - Head-to-head comparison (`/compare <p1> <p2>`).
  - Network-wide top leaderboards (`/leaderboard`).
  - Match history and recent PvP fights (`/fights <username>`).
  - Real-time network combat killfeed (`/killfeed`).
  - Persistent stat tracking and progression delta snapshots (`/track <add|remove|list|info>`).
- **Auction House Monitoring**:
  - Modular `AuctionProvider` architecture observing live `/ah` listings.
  - Public automated auction announcements feed (`/auctionfeed`).
  - Personal auction watches with custom max-price filters and private DM alerts (`/auction watch|watches|edit|pause|resume|delete|alerts`).
- **Warzone & SkyPvP Events**:
  - 6 SkyPvP automated events: *Floral Fortune, Envoy Drops, Blood Lust, Gold Rush, Hard Point, King of the Ladder (KOTL)* with dedicated role ping bindings and duplicate suppression (`/events`, `/ownerevents`).
  - **KOTH Monitoring**: Continuous monitoring of East & West KOTH with a single shared role ping on start and capture (`/ownerkoth`).
  - **Stronghold Monitoring**: Dedicated Stronghold channel and role pings on start and capture (`/ownerstronghold`).
  - **Warzone Outpost Board**: Continuous monitoring of the 4 SkyPvP outposts (*Souls, Damage, Resistance, Luckyblocks*) via in-game `./outposts` GUI observation with **zero role pings** and edit-in-place embeds (`/owneroutpost`).
- **Minecraft Public Chat Bridge**:
  - Strictly one-way: Minecraft ➔ Discord public chat relay (never forwards Discord messages into Minecraft).
  - Robust parser parsing: `[TEAM TAG] <PLAYER RANK> PLAYER_USERNAME [ADDITIONAL TAGS] › MESSAGE`.
  - Filter non-public messages (PMs, Party, Guild, Staff) and HUD action bar spam.
  - Support ANSI terminal colors, clean markdown, and rich embed card display styles (`/ownerchat`).
- **Release Announcements**:
  - Interactive `/updatelogs <post|list>` release notes publishing system with private ephemeral preview, owner-authenticated Confirm/Cancel workflow, role mentions, and database persistence.
- **Enterprise Security & Administration**:
  - Three-tier permission architecture: Public, Admin (Server Administrator), and Owner (Bot Owner).
  - Owner multi-co-owner support and public command availability controls (`/ownercommands`, `/ownersettings`).
  - 13-category structured Discord audit logging with log level filtering and JSON export (`/ownerlogs`).
  - AES-256-GCM encryption at rest for stored Minecraft credentials.

---

## 🛠️ Technology Stack

- **Runtime**: Node.js 22+ (ESM)
- **Language**: TypeScript 5.7+ (Strict Mode)
- **Discord Library**: Discord.js v14
- **Database**: PostgreSQL 16 / SQLite with Prisma ORM 6.19
- **Cache & Queues**: Redis 7 with BullMQ
- **Minecraft Automation**: Mineflayer
- **HTTP Client**: Undici with persistent Keep-Alive connection pooling
- **Validation**: Zod
- **Testing**: Vitest
- **Containerization**: Docker & Docker Compose

---

## 📋 Command Reference

### Public Commands
| Command | Subcommands / Options | Description |
|---|---|---|
| `/player` | `<username>` | Comprehensive player profile & SkyPvP combat summary |
| `/profile` | `<username>` | View network profile, level, and ranks |
| `/stats` | `<username> [interval]` | SkyPvP kills, deaths, KDR, streaks, balance |
| `/bal` | `<username>` | Check in-game balance and baltop ranking |
| `/baltop` | `[page]` | View richest SkyPvP players leaderboard (`/baltops`) |
| `/compare` | `<player1> <player2>` | Head-to-head combat and stats comparison |
| `/leaderboard` | `[stat] [interval]` | Server leaderboards (kills, balance, deaths, etc.) |
| `/fights` | `<username>` | Recent PvP fights and weapon usage |
| `/killfeed` | | Live network SkyPvP kill activity |
| `/track` | `add, remove, list, info` | Track player stat progression and snapshots |
| `/auction` | `search, watch, watches, watchlist, edit, pause, resume, delete, alerts` | SkyPvP Auction House search and DM alerts |
| `/team` | `tops, top, info` | Clan/Team leaderboards and detailed roster stats |
| `/events` | | Active in-game events and tournaments |
| `/chatstatus` | | Status of the one-way Minecraft chat bridge |
| `/help` | | Interactive command guide and documentation |
| `/ping` | | Independent latency telemetry (Gateway, REST, DB, Redis, API) |

### Admin Commands (Requires Server Administrator)
| Command | Subcommands | Description |
|---|---|---|
| `/setup` | | Overview of all configured channels, roles, and feature toggles |
| `/auctionfeed` | `view, channel, toggle, test` | Configure the server public auction feed channel |
| `/config` | `view, channel, roles, alerts, chat` | Comprehensive server alert bindings |
| `/alerts` | `test <category>` | Dispatch a test alert to verify channel and role permissions |
| `/tracking` | `settings` | View server tracking limits |
| `/server` | `stats` | View server host performance, CPU, memory, and uptime |

### Owner Commands (Restricted to Configured Bot Owners)
| Command | Subcommands | Description |
|---|---|---|
| `/owner` | `status, maintenance, reload, shutdown, servers, permissions, blacklist, announce, public-commands, owners` | Core bot administration controls |
| `/owneraccount` | `status, connect, disconnect, send, reconnect, configure, remove` | Manage Mineflayer observation bot |
| `/auctionowner` | `status, scrape, source` | Manual auction scraping and provider diagnostics |
| `/ownerevents` | `channel, clear-channel, role, toggle` | SkyPvP events alert channels and role bindings |
| `/ownerkoth` | `channel, role, toggle` | Shared East & West KOTH role and alert channel |
| `/ownerstronghold` | `channel, role, toggle` | Dedicated Stronghold channel and role bindings |
| `/owneroutpost` | `channel, interval, toggle, refresh, inspect` | Outpost live board channel and polling interval |
| `/ownerchat` | `channel, style, toggle` | One-way Minecraft chat bridge channel and style |
| `/ownerlogs` | `level, view, export, channel, remove, toggle, test` | 13-category logging and audit log export |
| `/ownersettings` | `view, set, reset, public-commands` | Global bot settings and maintenance mode |
| `/ownerupdates` | `channel, role, toggle, view, remove, test` | Destination channel and role for release notes |
| `/updatelogs` | `post, list` | Create, preview, and publish release announcements |
| `/ownercommands` | `list, enable, disable, set` | Public command availability configuration |
| `/ownerowners` | `list, add, remove` | Dynamic multi-owner management |

---

## 🚀 Installation & Deployment

### 1. Prerequisites
- **Node.js**: v22.0.0 or higher
- **Docker & Docker Compose**: Installed and running
- **Redis**: v7.0 or higher
- **PostgreSQL**: v16 or higher

### 2. Environment Configuration
Clone the repository and copy the environment configuration template:
```bash
cp .env.example .env
```
Edit `.env` and provide your credentials:
```env
DISCORD_TOKEN=your_bot_token_here
DISCORD_APP_ID=your_discord_application_id_here
DISCORD_OWNER_ID=your_discord_user_id_here
DATABASE_URL=postgresql://skypvp:skypvp_secure_password@localhost:5432/skypvputils
REDIS_URL=redis://localhost:6379
PIKA_API_KEY=your_pika_api_key_here
ENCRYPTION_KEY=your_64_char_hex_key_here
```
Generate an encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Build & Run via Docker Compose (Recommended)
```bash
# Start PostgreSQL, Redis, and the Bot Daemon
docker compose up -d --build

# Run database migrations
docker compose exec bot npx prisma migrate deploy

# Register slash commands with Discord
docker compose exec bot npm run commands:register
```

### 4. Running Directly on VPS (Bare Metal)
```bash
# Install dependencies
npm ci

# Push database schema
npx prisma db push

# Build TypeScript
npm run build

# Deploy slash commands
npm run commands:register

# Start production daemon
npm start
```

---

## 🔒 Security Architecture

1. **At-Rest Credential Encryption**: All Minecraft passwords stored in the database are encrypted using **AES-256-GCM** with unique initialization vectors (IV) and authentication tags. Passwords are never logged or exposed in status commands.
2. **Component & Command Authorization**: Every interaction (slash command, button click, modal submission, select menu selection) strictly validates user IDs against owner and admin lists before processing.
3. **One-Way Bridge**: The chat bridge strictly transmits messages from Minecraft into Discord. Inbound Discord messages are never relayed to Minecraft chat, eliminating game harassment and command injection vectors.
4. **Input Validation**: All user inputs and API responses are validated with strict **Zod** schemas.
5. **Proactive Rate Limiting**: The PikaNetwork API client uses an internal sliding-window throttle (under 120 req/min) and exponential backoff retry to guarantee uninterrupted service.

---

## 🧪 Testing

Run the full automated test suite covering 102 tests across all modules:
```bash
npm test
```
Compile TypeScript in strict mode:
```bash
npm run build
```
Verify types without emitting:
```bash
npm run lint
```
