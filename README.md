# 🤖 CryptoAwaz DVA Bot

> A Discord escrow bot for managing P2P USDT ↔ PKR trades on **Crypto Awaz**.  
> Handles the full deal lifecycle — from role assignment to Google Sheets logging — with built-in fee calculation.

[![Discord](https://img.shields.io/badge/Discord-Join%20Server-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/cryptoawaz)
[![Website](https://img.shields.io/badge/Website-cryptoawaz.com-F0B132?style=for-the-badge&logo=googlechrome&logoColor=white)](https://cryptoawaz.com)
[![Linktree](https://img.shields.io/badge/Linktree-cryptoawaz-43E55E?style=for-the-badge&logo=linktree&logoColor=white)](https://linktr.ee/cryptoawaz)

---

## ✨ Features

- **Full escrow workflow** — start, confirm, release, close, or cancel deals via slash commands
- **Auto fee calculation** — 1% standard fee, 0.5% for Discord boosters (3+ months)
- **Google Sheets logging** — every deal is logged with ID, date, staff share, parties, and booster info
- **Monthly auto-archive** — on the 1st of each month, the Fund Log is archived to a named tab and summary totals are updated
- **Deal persistence** — active deal survives bot restarts (discarded after 24 hours)
- **Fee calculator command** — `/fee` shows effective PKR/USDT rates for all 3 fee scenarios with interactive toggles
- **Staff mention guard** — notifies users in buy-sell channel if a deal is already in progress

---

## 📋 Commands

### `/dva` — Escrow Management *(Staff only)*

| Subcommand | Description |
|---|---|
| `/dva start @buyer @seller` | Starts a new deal. Assigns DVA-Temp role to both parties and posts deal info in the DVA channel |
| `/dva confirm <amount>` | Confirms USDT received, calculates escrow and fee, posts breakdown |
| `/dva release` | Releases escrow, logs the deal to Google Sheets |
| `/dva close` | Closes the deal and removes DVA-Temp roles from both parties |
| `/dva cancel [reason]` | Cancels the deal, removes roles, posts reason in channel |

> Only the staff member who started a deal can confirm, release, close, or cancel it.  
> Only one deal can be active at a time across the server.

---

### `/fee` — Fee Calculator *(Buy-Sell role required)*

```
/fee usdt:<amount> rate:<PKR per USDT>
```

Shows effective PKR/USDT rates for buyer and seller across **3 fee scenarios**:

| Scenario | Who bears the fee |
|---|---|
| 🔺 Fee on buyer | Buyer pays full PKR, receives less USDT |
| 🔻 Fee on seller | Buyer pays less PKR, seller sends full USDT |
| ✂️ Fee split | Fee halved, each side carries half |

**Interactive buttons** (locked to the command runner):
- Toggle between **Standard (1%)** and **Booster (0.5%)** rates
- Toggle between **Compact** and **Detailed** breakdown views

Buttons expire after 5 minutes.

---

## ⚙️ Fee Structure

| Condition | Fee |
|---|---|
| Standard deal | **1%** |
| Buyer or seller is a 3+ month Discord booster, deal ≥ 500 USDT | **0.5%** |

The DVA fee is always deducted from USDT. PKR is adjusted accordingly depending on which party bears the fee.

---

## 🗂️ Google Sheets Structure

### Fund Log tab

| Column | Field |
|---|---|
| A | Deal ID (auto-incrementing) |
| B | Date (Asia/Karachi) |
| C | Niazai's share |
| D | Nomy's share |
| E | SilentKiller's share |
| F | USDT Amount |
| G | Fee (USDT) |
| H | Booster applied |
| I | Buyer (username + ID) |
| J | Seller (username + ID) |
| K–L | Live summary block (staff totals) |

### Monthly Collection tab

Tracks monthly totals per staff member and running grand totals across all archived months.

### Archive tabs

On the 1st of each month (midnight PKT), the Fund Log is copied to a tab named e.g. `May 2026`, and the Fund Log is cleared.

---

## 🚀 Setup

### 1. Clone and install

```bash
git clone https://github.com/Dr-Hack/CryptoAwaz-DVA-BOT.git
cd CryptoAwaz-DVA-BOT
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

```env
# Discord
BOT_TOKEN=        # Bot token from Discord Developer Portal
CLIENT_ID=        # Your bot's application ID
GUILD_ID=         # Your Discord server ID

# Channels & Roles
DVA_CHANNEL_ID=       # ID of the #dva channel
DVA_TEMP_ROLE_ID=     # ID of the DVA-Temp role
BUYSELL_CHANNEL_ID=   # ID of the #buy-sell channel

# Google Sheets
SHEET_ID=         # Spreadsheet ID from the Google Sheets URL
SHEET_TAB=Fund Log
```

### 3. Add Google credentials

Place your Google Service Account key file as `credentials.json` in the project root.  
The service account needs **Editor** access to the spreadsheet.

> To create one: Google Cloud Console → IAM → Service Accounts → Create Key → JSON

### 4. Configure staff

Edit the `STAFF` object in `bot.js` with the Discord user IDs, column indexes, Binance IDs, and welcome messages for each staff member.

### 5. Run

```bash
npm start
```

Slash commands are registered automatically on bot startup (guild-scoped).

---

## 🔐 Security Notes

- **Never commit `.env` or `credentials.json`** — both are in `.gitignore`
- Rotate your bot token immediately if it is ever exposed
- The Google Service Account should only have access to the specific spreadsheet it needs

---

## 📦 Dependencies

| Package | Purpose |
|---|---|
| `discord.js` v14 | Discord API client |
| `googleapis` | Google Sheets read/write |
| `dotenv` | Environment variable loading |
| `node-cron` | Monthly archive scheduler |

---

## 🌐 Community

| Platform | Link |
|---|---|
| 💬 Discord | [discord.gg/cryptoawaz](https://discord.gg/cryptoawaz) |
| 🌍 Website | [cryptoawaz.com](https://cryptoawaz.com) |
| 🌿 Linktree | [linktr.ee/cryptoawaz](https://linktr.ee/cryptoawaz) |

---

## 📄 License

Private — Crypto Awaz internal use only.
