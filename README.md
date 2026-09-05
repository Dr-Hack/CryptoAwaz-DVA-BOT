# 🤖 CryptoAwaz DVA Discord Bot

> A Discord escrow bot for managing P2P USDT ↔ PKR trades on **Crypto Awaz**.  
> Handles the full deal lifecycle — from role assignment to Google Sheets logging — with built-in fee calculation for users.

[![Discord](https://img.shields.io/badge/Discord-Join%20Server-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/cryptoawaz)
[![Website](https://img.shields.io/badge/Website-cryptoawaz.com-F0B132?style=for-the-badge&logo=googlechrome&logoColor=white)](https://cryptoawaz.com)
[![Linktree](https://img.shields.io/badge/Linktree-cryptoawaz-43E55E?style=for-the-badge&logo=linktree&logoColor=white)](https://linktr.ee/cryptoawaz)

---

## ✨ Features

- **Full escrow workflow** — start, confirm, release, close, or cancel deals via slash commands
- **Party detail collection** — buyer and seller submit Binance and bank details through private modals; the bot posts each to the other party at the right moment and deletes them on close
- **Address gate** — the staff deposit address is held back until *both* parties have submitted, so the deal never stalls halfway through with funds already moving
- **Account registry** — every account used is logged to the `Details Log` tab for scam cross-referencing; returning traders pick a saved account instead of retyping
- **Shared-account audit** — `/dva audit` finds accounts used by more than one member across the whole registry
- **Cash deals** — a parallel `#dva-cash` slot for bank-deposit and face-to-face trades, running independently of the normal slot
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
| `/dva start @buyer @seller [type]` | Starts a new deal. Assigns DVA-Temp role to both parties and posts deal info. `type` picks the **normal** (Binance) or **cash** (bank/F2F) slot |
| `/dva confirm <amount>` | Confirms USDT received, calculates escrow and fee, posts breakdown |
| `/dva confirm-update <amount>` | Adjusts the escrow on a live deal — positive to add, negative to reduce |
| `/dva release` | Releases escrow, logs the deal to Google Sheets |
| `/dva close` | Closes the deal, removes DVA-Temp roles, and deletes every message carrying account details |
| `/dva cancel [reason]` | Cancels the deal, removes roles, posts reason in channel |
| `/dva details` | Ephemeral view of the details both parties submitted, plus buttons to post the buyer's payout block or release the deposit address early |
| `/dva audit` | Scans the whole `Details Log` for accounts shared between different members |
| `/dva stats` | Last completed month and last 7 days — volume, deals, members, booster savings |
| `/dva discount <boost_since> <duration>` | Starts a time-limited booster discount campaign *(Niazai only)* |

> Only the staff member who started a deal can confirm, release, close, or cancel it.  
> **Two** deals can run at once — one normal, one cash — each in its own channel.

---

### 🔐 Party detail collection

On `/dva start` the bot posts two buttons in the deal channel, each locked to one party:

| Button | Opens | Collects |
|---|---|---|
| 💳 **Seller — Bank Details** | Bank ▾ + Relation ▾ pickers, then a modal | Account title, account number, IBAN |
| 🏦 **Buyer — Payout Details** | Modal | Binance ID, Binance name, wallet, network |

The **Bank** and **Relation** dropdown values are read live from the `Details Log` sheet's own
data-validation rules — edit them in Sheets and the bot follows on next restart. Discord caps a
dropdown at 25 options, so anything past the 24th bank folds into an `Other…` free-text entry.

Details are then surfaced automatically:

| Moment | What the bot posts |
|---|---|
| **Both parties have submitted** | The staff deposit address, and `@seller — please send your crypto asset to:` |
| `/dva confirm` | Seller's receiving account, with a ⚠️ warning if the relation isn't `Self` |
| Buyer uploads a receipt image | Prompts the seller to confirm payment, then shows the buyer's payout details |
| `/dva close` / `/dva cancel` | Deletes every message it posted containing account details |

Each block carries a two-part badge: **verified status** comes from the Discord `VERIFIED` role
(per person), **known/new account** comes from the sheet (per account) — so a verified member using
an unfamiliar account is visible at a glance.

#### The address gate

Each staff member's config has two message parts: `message` (SOP text, posted at `/dva start`) and
`addresses` (their deposit addresses, held back). The addresses post only once **both** parties have
submitted — whoever submits second trips the gate.

The delay this creates sits at the very start of a deal, before anyone has moved funds, rather than
in the middle of one where staff are chasing a party while crypto sits in escrow. It is also
self-correcting: every gated deal writes a payout row to the registry, so more traders clear the
gate with a single button press each time.

Until both are in, the bot names who it is waiting on and tags them. Staff are never locked out —
`/dva details` carries a **🔓 Reveal Address Anyway** button for the case where a party genuinely
can't submit, and the channel is told plainly that the address went out with details outstanding.

Nothing else is ever blocked. If a party hasn't submitted, the bot says so publicly and warns staff
ephemerally, and the deal proceeds so details can be collected by hand.

> ⚠️ The receipt-image trigger requires **Message Content Intent** to be enabled under
> Bot → Privileged Gateway Intents in the Discord Developer Portal. Everything else works without it;
> staff can always post the payout block via `/dva details`.

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

### Details Log tab

A per-person account registry — one row per account. A person may hold several rows.

| Column | Field | Written by |
|---|---|---|
| A | Discord Name | Bot (on new rows) |
| B | Verified ☑ | Bot — mirrors the Discord `VERIFIED` role, ticked **and** unticked |
| C | Discord UID | Bot |
| D | Title | Bot |
| E | Bank ▾ | Bot (value comes from this column's own dropdown) |
| F | Relation /w Ac ▾ | Bot (same) |
| G | Acc Number | Bot |
| H | IBAN | Bot |
| I | Binance ID | Bot — multiple IDs stored as `1234 / 5678` |
| J | Binance Name | Bot — kept positionally paired with column I |
| K | Phone No. | **Never touched** |
| L | Comments | **Never touched** |
| M | Address | Bot — wallet address for buyers who take payout off-exchange |
| N | Network | Bot — kept positionally paired with column M |

Write rules:
- A **new bank account** appends a new row, so the history of every account a person has used is retained.
- A **new Binance ID** fills the empty Binance cells across all of that person's rows, or is appended
  as `old / new` where one is already present. A person with no rows at all gets a fresh one.
- Rows are written at **submit time**, so a cancelled deal still leaves the account on record.
- No bank or Binance data ever reaches the **Fund Log** tab.
- ⚠️ Every Details Log write uses `valueInputOption: "RAW"`, **never** `USER_ENTERED`. Sheets parses a
  `USER_ENTERED` value as if a person typed it, so an Easypaisa number like `03006911565` is read as a
  number and stored as `3006911565` — the leading zero is destroyed silently and the account becomes
  unusable. The one exception is the Verified column, which writes a boolean and *does* want parsing so
  the checkbox ticks.

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
DVA_CHANNEL_ID=            # ID of the #dva channel
DVA_TEMP_ROLE_ID=          # ID of the DVA-Temp role
DVA_CASH_CHANNEL_ID=       # ID of the #dva-cash channel
DVA_CASH_TEMP_ROLE_ID=     # ID of the DVA-Cash-Temp role
BUYSELL_CHANNEL_ID=        # ID of the #buy-sell channel

# Google Sheets
SHEET_ID=         # Spreadsheet ID from the Google Sheets URL
SHEET_TAB=Fund Log
```

### 3. Add Google credentials

Place your Google Service Account key file as `credentials.json` in the project root.  
The service account needs **Editor** access to the spreadsheet.

> To create one: Google Cloud Console → IAM → Service Accounts → Create Key → JSON

### 4. Configure staff

Edit the `STAFF` object in `bot.js` with the Discord user IDs, column indexes, and Binance IDs for each
staff member. Each entry carries **two** message fields, and the split matters:

| Field | Posted |
|---|---|
| `message` | At `/dva start` — SOP text only, no addresses |
| `addresses` | Once both parties have submitted — the deposit addresses themselves |

A staff member with no `addresses` set simply never gates: the bot falls back to posting the plain
submission acknowledgements, so nothing breaks, but no deposit address is ever shown for their deals.

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
