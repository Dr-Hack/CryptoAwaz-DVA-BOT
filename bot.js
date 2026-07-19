// DVA Bot - bot.js
// Version: 1.18
// Last Modified: 2026-07-19
// Dependencies: discord.js@14, googleapis, dotenv, node-cron
// Install: npm install discord.js googleapis dotenv node-cron

require("dotenv").config();
const feeCommand = require("./fee-command.js");
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder } = require("discord.js");
const { google } = require("googleapis");
const cron = require("node-cron");

// ─── STAFF CONFIG ─────────────────────────────────────────────────────────────
// Replace STAFF_X_DISCORD_ID with actual Discord User IDs
const STAFF = {
  "377834469656100865": {
    name: "Niazai",
    colIndex: 1, // logs to Column B in Fund Log
    binanceId: "11905680",
    message: "Please share deal details and proceed as per SOP.\nAll deal related talk to be done in this chat, including sharing of Bank information, which is deleted on termination of a deal. Share screenshot after making any payment.\n\n**Binance ID:** 11905680"
  },
  "814816806895091752": {
    name: "Nomy",
    colIndex: 2, // logs to Column C
    binanceId: "75096450",
    message: "Please share the deal details and proceed according to the DVA SOP. Both of you are advised to use personal accounts for sending and receiving PKR to avoid future banking issues. Share all transaction-related details, including bank screenshots and receipts, in this chat. Bank information will be deleted once the deal is completed.\n\n**Binance ID:** 75096450\n**TRC-20 USDT:** TVWmhTBdZb5ech2Rx3vfXEwdzT6D3gzuuA\n**BEP-20 USDT:** 0xf8387123c01a5e1a18c73cd550cba3763d6dc3f3"
  },
  "349465216209387530": {
    name: "SilentKiller",
    colIndex: 3, // logs to Column D
    binanceId: "35798024",
    message: "Please share deal details and proceed as per SOP.\nAll deal related talk to be done in this chat, including sharing of Bank information, which is deleted on termination of a deal.\n\n**Binance ID:** 35798024 | **Username:** SilentKiller4233\n**SOL BINANCE USDC/USDT:**\n41poDbaaHWPd3GCHNXZz8XroNy9xzLeYYtqjFTCMya7X\n**ETH/BEP20 BINANCE USDC/USDT:**\n0xe50376a8566f348c17aa10e83182ac7e7f44ebe3\n**TRC20 BINANCE USDT:**\nTQ1VrZNo7zj8RvPg8RjXwyS2UcsWgv6ENV"
  }
};

// ─── ENV CONFIG ───────────────────────────────────────────────────────────────
const DVA_CHANNEL_ID        = process.env.DVA_CHANNEL_ID;
const DVA_TEMP_ROLE_ID      = process.env.DVA_TEMP_ROLE_ID;
const DVA_CASH_CHANNEL_ID   = process.env.DVA_CASH_CHANNEL_ID;
const DVA_CASH_TEMP_ROLE_ID = process.env.DVA_CASH_TEMP_ROLE_ID;
const BUYSELL_CHANNEL_ID    = process.env.BUYSELL_CHANNEL_ID;
const SHEET_ID            = process.env.SHEET_ID;
const FUND_LOG_TAB        = process.env.SHEET_TAB || "Fund Log";
const MONTHLY_TAB         = "Monthly Collection";
const BOOSTER_MIN_MONTHS  = 3;
const BOOSTER_THRESHOLD   = 500;
const STAFF_ROLE_ID       = "831157132346130492";

// ─── GOOGLE SHEETS AUTH ───────────────────────────────────────────────────────
function getSheets() {
  const auth = new google.auth.GoogleAuth({
    keyFile: "credentials.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  return google.sheets({ version: "v4", auth });
}

// ─── SHEET HELPERS ────────────────────────────────────────────────────────────
async function getRange(sheets, range) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID, range
  });
  return res.data.values || [];
}

async function writeRange(sheets, range, values) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values }
  });
}

async function appendRow(sheets, tab, row) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A:J`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] }
  });
}

async function getSheetMeta(sheets) {
  const res = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  return res.data.sheets;
}

async function addTab(sheets, title) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] }
  });
}

async function getNextDealId(sheets) {
  const rows = await getRange(sheets, `${FUND_LOG_TAB}!A:A`);
  const ids  = rows.filter(r => r[0] && !isNaN(r[0])).map(r => parseInt(r[0]));
  return ids.length > 0 ? Math.max(...ids) + 1 : 1;
}

// ─── AMOUNT DISPLAY HELPER ────────────────────────────────────────────────────
function formatAmountDisplay(deal) {
  if (deal.amounts && deal.amounts.length > 1) {
    return `${deal.amounts.join("+")} : ${deal.amount}`;
  }
  return `${deal.amount}`;
}

// ─── LOG DEAL TO FUND LOG ─────────────────────────────────────────────────────
// Sheet columns: A=DealID | B=Date | C=Niazai | D=Nomy | E=SilentKiller | F=USDT Amount | G=Fee | H=Booster | I=Buyer | J=Seller
// If closerStaffId is provided and differs from deal.staffId, the staff share is split 50/50 between them.
async function logDeal(deal, closerStaffId) {
  const sheets      = getSheets();
  const starterInfo = STAFF[deal.staffId];
  const fee         = parseFloat((deal.amount * deal.feePercent / 100).toFixed(4));
  const dealId      = await getNextDealId(sheets);
  const now         = new Date().toLocaleDateString("en-PK", { timeZone: "Asia/Karachi" });

  const row = Array(10).fill("");
  row[0] = dealId;
  row[1] = now;
  row[5] = deal.amount;
  row[6] = fee;
  row[7] = deal.booster ? `Yes (@${deal.boosterName})` : "No";
  row[8] = `${deal.buyerName} (${deal.buyerId})`;
  row[9] = `${deal.sellerName} (${deal.sellerId})`;

  if (closerStaffId && closerStaffId !== deal.staffId && STAFF[closerStaffId]) {
    // Split: starter and closer each get 25% of the total fee
    const halfShare = parseFloat((fee * 0.25).toFixed(4));
    row[starterInfo.colIndex + 1]               = halfShare;
    row[STAFF[closerStaffId].colIndex + 1]      = halfShare;
  } else {
    row[starterInfo.colIndex + 1] = parseFloat((fee * 0.5).toFixed(4));
  }

  await appendRow(sheets, FUND_LOG_TAB, row);
  await updateSummaryBlock(sheets);
}

// ─── SUMMARY BLOCK (right side of Fund Log, K2:L6) ───────────────────────────
async function updateSummaryBlock(sheets) {
  const rows     = await getRange(sheets, `${FUND_LOG_TAB}!A:J`);
  const dataRows = rows.filter(r => r[0] && !isNaN(r[0]));

  const totals = { Niazai: 0, Nomy: 0, SilentKiller: 0 };
  for (const r of dataRows) {
    totals.Niazai      += parseFloat(r[2]) || 0;
    totals.Nomy        += parseFloat(r[3]) || 0;
    totals.SilentKiller+= parseFloat(r[4]) || 0;
  }
  const grand = totals.Niazai + totals.Nomy + totals.SilentKiller;

  await writeRange(sheets, `${FUND_LOG_TAB}!K2:L6`, [
    ["Staff",        "Share"],
    ["Niazai",       `$${totals.Niazai.toFixed(2)}`],
    ["Nomy",         `$${totals.Nomy.toFixed(2)}`],
    ["SilentKiller", `$${totals.SilentKiller.toFixed(2)}`],
    ["Grand Total",  `$${grand.toFixed(2)}`]
  ]);
}

// Only tabs named "Month YYYY" (e.g. "June 2026") are archive tabs
const ARCHIVE_TAB_RE = /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/;

// ─── MONTHLY ARCHIVE ──────────────────────────────────────────────────────────
// targetYear / targetMonthIdx (0-based) let us archive any past month.
// Defaults to the previous calendar month.
async function archiveMonth(targetYear, targetMonthIdx) {
  const sheets = getSheets();
  const now    = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi" }));

  const archiveDate = (targetYear != null && targetMonthIdx != null)
    ? new Date(targetYear, targetMonthIdx, 1)
    : new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const monthName = archiveDate.toLocaleString("en-US", { month: "long", year: "numeric" });
  const archM     = archiveDate.getMonth();    // 0-based
  const archY     = archiveDate.getFullYear();

  const rows = await getRange(sheets, `${FUND_LOG_TAB}!A:J`);
  if (rows.length <= 1) { console.log("[DVA] Nothing to archive."); return; }

  const header   = [rows[0]];
  const allData  = rows.filter(r => r[0] && !isNaN(r[0]));

  // Split rows: only archive entries that belong to the target month
  const toArchive = [];
  const toKeep    = [];
  for (const r of allData) {
    const parts  = (r[1] || "").split("/");   // stored as DD/MM/YYYY (en-PK)
    const rMonth = parseInt(parts[1]) - 1;    // 0-based
    const rYear  = parseInt(parts[2]);
    if (rMonth === archM && rYear === archY) {
      toArchive.push(r);
    } else {
      toKeep.push(r);
    }
  }

  if (toArchive.length === 0) {
    console.log(`[DVA] No entries found for ${monthName}, skipping.`);
    return;
  }

  // Create archive tab if not exists and write archived rows
  const meta   = await getSheetMeta(sheets);
  const exists = meta.some(s => s.properties.title === monthName);
  if (!exists) await addTab(sheets, monthName);
  await writeRange(sheets, `${monthName}!A1`, [...header, ...toArchive]);

  // Calc totals for archived rows only
  let niazai = 0, nomy = 0, silent = 0, volume = 0;
  for (const r of toArchive) {
    niazai += parseFloat(r[2]) || 0;
    nomy   += parseFloat(r[3]) || 0;
    silent += parseFloat(r[4]) || 0;
    volume += parseFloat(r[5]) || 0;
  }
  const monthlyTotal = niazai + nomy + silent;

  // Update Monthly Collection
  const mcRows = await getRange(sheets, `${MONTHLY_TAB}!B:F`);
  let updated  = false;
  for (let i = 1; i < mcRows.length; i++) {
    if (mcRows[i][0] === monthName) {
      await writeRange(sheets, `${MONTHLY_TAB}!C${i + 1}:F${i + 1}`, [[
        `$${niazai.toFixed(2)}`, `$${nomy.toFixed(2)}`,
        `$${silent.toFixed(2)}`, `$${monthlyTotal.toFixed(2)}`
      ]]);
      updated = true;
      break;
    }
  }
  if (!updated) {
    await appendRow(sheets, MONTHLY_TAB, [
      "", monthName,
      `$${niazai.toFixed(2)}`, `$${nomy.toFixed(2)}`,
      `$${silent.toFixed(2)}`, `$${monthlyTotal.toFixed(2)}`
    ]);
  }

  // Recalculate grand totals — only look at properly named archive tabs
  const allMeta = await getSheetMeta(sheets);
  let gtNiazai = 0, gtNomy = 0, gtSilent = 0, gtVolume = 0;
  for (const sheet of allMeta) {
    const t = sheet.properties.title;
    if (!ARCHIVE_TAB_RE.test(t)) continue;
    const archRows = await getRange(sheets, `${t}!A:J`);
    for (const r of archRows.filter(r => r[0] && !isNaN(r[0]))) {
      gtNiazai += parseFloat(r[2]) || 0;
      gtNomy   += parseFloat(r[3]) || 0;
      gtSilent += parseFloat(r[4]) || 0;
      gtVolume += parseFloat(r[5]) || 0;
    }
  }
  const gtTotal = gtNiazai + gtNomy + gtSilent;
  await writeRange(sheets, `${MONTHLY_TAB}!H2:I3`, [
    ["G. Total",   `$${gtTotal.toFixed(2)}`],
    ["DVA Volume", `$${gtVolume.toFixed(2)}`]
  ]);

  // Clear Fund Log and re-write any rows from other months that should stay
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${FUND_LOG_TAB}!A2:J1000`
  });
  if (toKeep.length > 0) {
    await writeRange(sheets, `${FUND_LOG_TAB}!A2`, toKeep);
  }
  await updateSummaryBlock(sheets);
  console.log(`[DVA] Archived ${monthName} (${toArchive.length} deal(s)). ${toKeep.length} row(s) kept in Fund Log.`);
}

// ─── STARTUP: catch any missed monthly archive ────────────────────────────────
async function checkMissedArchive() {
  const sheets    = getSheets();
  const now       = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi" }));
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const rows      = await getRange(sheets, `${FUND_LOG_TAB}!A:J`);
  const dataRows  = rows.filter(r => r[0] && !isNaN(r[0]));

  const pastMonths = new Set();
  for (const r of dataRows) {
    const parts  = (r[1] || "").split("/");
    if (parts.length < 3) continue;
    const rMonth = parseInt(parts[1]) - 1;
    const rYear  = parseInt(parts[2]);
    if (new Date(rYear, rMonth, 1) < thisMonth) {
      pastMonths.add(`${rYear}:${rMonth}`);
    }
  }

  for (const key of pastMonths) {
    const [y, m] = key.split(":").map(Number);
    const label  = new Date(y, m, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
    console.log(`[DVA] Missed archive detected: ${label}. Archiving now...`);
    await archiveMonth(y, m);
  }
}

// ─── CRON: midnight PKT (19:00 UTC), runs on 1st of month ────────────────────
cron.schedule("0 0 1 * *", async () => {
  console.log("[DVA] Running monthly archive...");
  await archiveMonth().catch(e => console.error("[DVA] Archive error:", e));
}, { timezone: "Asia/Karachi" });

// ─── DEAL PERSISTENCE ────────────────────────────────────────────────────────
const fs             = require("fs");
const DEAL_FILE      = "active_deal.json";
const CASH_DEAL_FILE = "active_cash_deal.json";
const MAX_DEAL_AGE_HOURS = 24;

function saveDeal(deal, file) {
  try {
    fs.writeFileSync(file, JSON.stringify({ ...deal, savedAt: Date.now() }, null, 2));
  } catch (e) { console.error("[DVA] Failed to save deal:", e); }
}

function clearDealFile(file) {
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch (e) { console.error("[DVA] Failed to clear deal file:", e); }
}

function loadDeal(file) {
  try {
    if (!fs.existsSync(file)) return null;
    const deal = JSON.parse(fs.readFileSync(file, "utf8"));
    const ageHours = (Date.now() - deal.savedAt) / (1000 * 60 * 60);
    if (ageHours > MAX_DEAL_AGE_HOURS) {
      console.log(`[DVA] Stale deal in ${file} (>24hrs), discarding.`);
      clearDealFile(file);
      return null;
    }
    console.log(`[DVA] Restored deal from ${file} (started by ${deal.staffId}).`);
    return deal;
  } catch (e) {
    console.error("[DVA] Failed to load deal file:", e);
    return null;
  }
}

// Central deal state: "normal" = #dva, "cash" = #dva-cash
const dealState = {
  normal: { deal: loadDeal(DEAL_FILE),      file: DEAL_FILE      },
  cash:   { deal: loadDeal(CASH_DEAL_FILE),  file: CASH_DEAL_FILE }
};

// ─── CLOSE REMINDER ───────────────────────────────────────────────────────────
// Pings staff in the correct DVA channel every 2 minutes after /dva release.
const reminderIntervals = { normal: null, cash: null };

function startCloseReminder(key) {
  if (reminderIntervals[key]) return;
  const channelId = key === "cash" ? DVA_CASH_CHANNEL_ID : DVA_CHANNEL_ID;
  const staffId   = dealState[key].deal.staffId;
  reminderIntervals[key] = setInterval(async () => {
    try {
      const guild   = client.guilds.cache.get(process.env.GUILD_ID);
      const channel = guild?.channels.cache.get(channelId);
      if (channel) await channel.send(`⏰ <@${staffId}> Please close the DVA using **/dva close**.`);
    } catch (e) { console.error("[DVA] Reminder error:", e); }
  }, 2 * 60 * 1000);
}

function stopCloseReminder(key) {
  if (reminderIntervals[key]) {
    clearInterval(reminderIntervals[key]);
    reminderIntervals[key] = null;
  }
}

// ─── DISCORD CLIENT ───────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// ─── SLASH COMMANDS ───────────────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName("dva")
    .setDescription("DVA escrow system")
    .addSubcommand(s => s
      .setName("start")
      .setDescription("Start a new DVA deal")
      .addUserOption(o => o.setName("buyer").setDescription("Buyer").setRequired(true))
      .addUserOption(o => o.setName("seller").setDescription("Seller").setRequired(true))
      .addStringOption(o => o
        .setName("type")
        .setDescription("Deal type — Normal (Binance) or Cash (Bank/F2F). Default: normal.")
        .addChoices(
          { name: "Normal",         value: "normal" },
          { name: "Cash (Bank/F2F)", value: "cash"   }
        )
      )
    )
    .addSubcommand(s => s
      .setName("confirm")
      .setDescription("Confirm USDT received and set escrow")
      .addNumberOption(o => o.setName("amount").setDescription("USDT amount received").setRequired(true))
    )
    .addSubcommand(s => s
      .setName("confirm-update")
      .setDescription("Add more USDT to the current deal escrow")
      .addNumberOption(o => o.setName("amount").setDescription("Additional USDT amount").setRequired(true))
    )
    .addSubcommand(s => s
      .setName("release")
      .setDescription("Release escrow")
    )
    .addSubcommand(s => s
      .setName("close")
      .setDescription("Close deal and remove DVA-Temp roles")
    )
    .addSubcommand(s => s
      .setName("cancel")
      .setDescription("Cancel the current deal")
      .addStringOption(o => o.setName("reason").setDescription("Reason (optional)"))
    ),
  feeCommand.data
].map(c => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );
  console.log("[DVA] Slash commands registered.");
}

// ─── BOOSTER CHECK ────────────────────────────────────────────────────────────
function getBoosterMonths(member) {
  if (!member.premiumSince) return 0;
  return (Date.now() - member.premiumSince.getTime()) / (1000 * 60 * 60 * 24 * 30);
}

// ─── INTERACTION HANDLER ──────────────────────────────────────────────────────
client.on("interactionCreate", async interaction => {
  if (interaction.isChatInputCommand() && interaction.commandName === "fee") {
    return feeCommand.execute(interaction);
  }

  if (!interaction.isChatInputCommand() || interaction.commandName !== "dva") return;

  const sub     = interaction.options.getSubcommand();
  const guild   = interaction.guild;
  const channel = interaction.channel;
  const staffId = interaction.user.id;

  if (!STAFF[staffId]) {
    return interaction.reply({ content: "❌ You are not authorized to use DVA commands.", ephemeral: true });
  }

  // ── Channel guard ────────────────────────────────────────────────────────────
  if (sub === "start") {
    if (channel.id !== DVA_CHANNEL_ID && channel.id !== BUYSELL_CHANNEL_ID && channel.id !== DVA_CASH_CHANNEL_ID) {
      return interaction.reply({
        content: `❌ DVA commands can only be used in <#${DVA_CHANNEL_ID}>, <#${DVA_CASH_CHANNEL_ID}>, or <#${BUYSELL_CHANNEL_ID}>.`,
        ephemeral: true
      });
    }
  } else {
    if (channel.id !== DVA_CHANNEL_ID && channel.id !== DVA_CASH_CHANNEL_ID) {
      return interaction.reply({
        content: `❌ This command can only be used in <#${DVA_CHANNEL_ID}> or <#${DVA_CASH_CHANNEL_ID}>.`,
        ephemeral: true
      });
    }
  }

  // ── Deal slot routing ────────────────────────────────────────────────────────
  // For /dva start: type option picks the slot.
  // For all other commands: the channel you run it in determines the slot.
  const key = (sub === "start")
    ? ((interaction.options.getString("type") || "normal") === "cash" ? "cash" : "normal")
    : (channel.id === DVA_CASH_CHANNEL_ID ? "cash" : "normal");

  const ctx        = dealState[key];
  const dvaChanId  = key === "cash" ? DVA_CASH_CHANNEL_ID : DVA_CHANNEL_ID;
  const dvaChannel = guild.channels.cache.get(dvaChanId);
  const tempRoleId = key === "cash" ? DVA_CASH_TEMP_ROLE_ID : DVA_TEMP_ROLE_ID;

  // ── /dva start ──────────────────────────────────────────────────────────────
  if (sub === "start") {
    if (ctx.deal) {
      return interaction.reply({
        content: `⚠️ A ${key} deal is already in progress (started by <@${ctx.deal.staffId}>). Close or cancel it first.`,
        ephemeral: true
      });
    }

    const buyer   = interaction.options.getMember("buyer");
    const seller  = interaction.options.getMember("seller");
    const dvaRole = guild.roles.cache.get(tempRoleId);

    if (!dvaRole) return interaction.reply({ content: "❌ DVA-Temp role not found. Check your .env.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    await buyer.roles.add(dvaRole);
    await seller.roles.add(dvaRole);

    // Wait for Discord to propagate role assignment before sending message
    await new Promise(r => setTimeout(r, 2000));

    ctx.deal = {
      staffId,
      buyerId:      buyer.id,
      buyerName:    buyer.user.username,
      sellerId:     seller.id,
      sellerName:   seller.user.username,
      amount:       null,
      amounts:      null,
      feePercent:   null,
      escrowAmount: null,
      booster:      null,
      boosterName:  null,
      released:     false
    };
    saveDeal(ctx.deal, ctx.file);

    await dvaChannel.send(
      `<@&${tempRoleId}> — New DVA deal initiated by <@${staffId}>\n` +
      `👤 **Buyer:** <@${buyer.id}> *(Buying USDT)*\n` +
      `👤 **Seller:** <@${seller.id}> *(Selling USDT)*\n\n` +
      `${STAFF[staffId].message}`
    );

    const buySellChannel = guild.channels.cache.get(BUYSELL_CHANNEL_ID);
    if (buySellChannel) {
      await buySellChannel.send(
        `🎯 <@${buyer.id}> & <@${seller.id}> — Please head over to <#${dvaChanId}> to proceed.`
      );
    }

    return interaction.editReply({ content: `✅ Deal started. DVA-Temp assigned to <@${buyer.id}> and <@${seller.id}>.` });
  }

  // ── /dva confirm ────────────────────────────────────────────────────────────
  if (sub === "confirm") {
    if (!ctx.deal)                    return interaction.reply({ content: "❌ No active deal.", ephemeral: true });
    if (ctx.deal.staffId !== staffId) return interaction.reply({ content: "❌ You didn't start this deal.", ephemeral: true });

    const amount      = interaction.options.getNumber("amount");
    ctx.deal.amount   = amount;
    ctx.deal.amounts  = [amount];

    if (amount >= BOOSTER_THRESHOLD) {
      const bMember = guild.members.cache.get(ctx.deal.buyerId);
      const sMember = guild.members.cache.get(ctx.deal.sellerId);
      const bMonths = getBoosterMonths(bMember);
      const sMonths = getBoosterMonths(sMember);
      const booster = bMonths >= BOOSTER_MIN_MONTHS ? bMember
                    : sMonths >= BOOSTER_MIN_MONTHS ? sMember : null;

      if (booster) {
        ctx.deal.feePercent   = 0.5;
        ctx.deal.booster      = booster.id;
        ctx.deal.boosterName  = booster.user.username;
        ctx.deal.escrowAmount = parseFloat((amount - amount * 0.005).toFixed(4));
        await dvaChannel.send(
          `✅ ${amount} USDT received\n` +
          `🔒 ${ctx.deal.escrowAmount} USDT escrow\n\n` +
          `🎉 Booster discount applied for <@${booster.id}> — Fee: **0.5%**\n\n` +
          `<@${ctx.deal.buyerId}> Please send funds to <@${ctx.deal.sellerId}>`
        );
      } else {
        ctx.deal.feePercent   = 1;
        ctx.deal.escrowAmount = parseFloat((amount - amount * 0.01).toFixed(4));
        await dvaChannel.send(
          `✅ ${amount} USDT received\n` +
          `🔒 ${ctx.deal.escrowAmount} USDT escrow\n\n` +
          `📋 Fee: **1%**\n\n` +
          `<@${ctx.deal.buyerId}> Please send funds to <@${ctx.deal.sellerId}>`
        );
      }
    } else {
      ctx.deal.feePercent   = 1;
      ctx.deal.escrowAmount = parseFloat((amount - amount * 0.01).toFixed(4));
      await dvaChannel.send(
        `✅ ${amount} USDT received\n` +
        `🔒 ${ctx.deal.escrowAmount} USDT escrow\n\n` +
        `<@${ctx.deal.buyerId}> Please send funds to <@${ctx.deal.sellerId}>`
      );
    }
    saveDeal(ctx.deal, ctx.file);

    return interaction.reply({ content: "✅ Escrow confirmed.", ephemeral: true });
  }

  // ── /dva confirm-update ─────────────────────────────────────────────────────
  if (sub === "confirm-update") {
    if (!ctx.deal)                    return interaction.reply({ content: "❌ No active deal.", ephemeral: true });
    if (ctx.deal.staffId !== staffId) return interaction.reply({ content: "❌ You didn't start this deal.", ephemeral: true });
    if (!ctx.deal.feePercent)         return interaction.reply({ content: "❌ Run /dva confirm first.", ephemeral: true });
    if (ctx.deal.released)            return interaction.reply({ content: "⚠️ Escrow already released. Cannot update amount.", ephemeral: true });

    const addAmount = interaction.options.getNumber("amount");

    // Graceful backward compat: if amounts wasn't stored (old deal), seed it now
    if (!ctx.deal.amounts) ctx.deal.amounts = [ctx.deal.amount];

    ctx.deal.amounts.push(addAmount);
    ctx.deal.amount      = parseFloat((ctx.deal.amount + addAmount).toFixed(4));
    const feePct         = ctx.deal.feePercent / 100;
    ctx.deal.escrowAmount = parseFloat((ctx.deal.amount * (1 - feePct)).toFixed(4));

    const amountDisplay = formatAmountDisplay(ctx.deal);
    await dvaChannel.send(
      `✅ ${amountDisplay} USDT received\n` +
      `🔒 ${ctx.deal.escrowAmount} USDT escrow\n\n` +
      `<@${ctx.deal.buyerId}> Please send funds to <@${ctx.deal.sellerId}>`
    );
    saveDeal(ctx.deal, ctx.file);

    return interaction.reply({ content: "✅ Escrow amount updated.", ephemeral: true });
  }

  // ── /dva release ────────────────────────────────────────────────────────────
  if (sub === "release") {
    if (!ctx.deal)                    return interaction.reply({ content: "❌ No active deal.", ephemeral: true });
    if (ctx.deal.staffId !== staffId) return interaction.reply({ content: "❌ You didn't start this deal.", ephemeral: true });
    if (!ctx.deal.escrowAmount)       return interaction.reply({ content: "❌ Run /dva confirm first.", ephemeral: true });
    if (ctx.deal.released)            return interaction.reply({ content: "⚠️ Escrow has already been released for this deal. Use **/dva close** to wrap up.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    await dvaChannel.send(
      `✅ **Escrow Released!**\n` +
      `💵 Amount: ${formatAmountDisplay(ctx.deal)} USDT\n` +
      `💸 Released: ${ctx.deal.escrowAmount} USDT`
    );

    ctx.deal.released = true;
    saveDeal(ctx.deal, ctx.file);
    startCloseReminder(key);

    return interaction.editReply({ content: "✅ Escrow released. Use **/dva close** to finalize and log to Sheets." });
  }

  // ── /dva close ──────────────────────────────────────────────────────────────
  // Any staff member can close — acts as a safety override after /dva release.
  // If a different staff closes, the sheet log splits the fee 50/50 between starter and closer.
  if (sub === "close") {
    if (!ctx.deal) return interaction.reply({ content: "❌ No active deal.", ephemeral: true });

    // Block if escrow was confirmed but not yet released
    if (ctx.deal.escrowAmount && !ctx.deal.released) {
      return interaction.reply({
        content: `⚠️ Escrow of **${ctx.deal.escrowAmount} USDT** has not been released yet.\nPlease run **/dva release** first, or run **/dva cancel** if the deal fell through.`,
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const isOverride   = staffId !== ctx.deal.staffId;
    const closeMessage = isOverride
      ? `======🙏 Thank you! DVA closed======\nDVA started by <@${ctx.deal.staffId}> — Closed by <@${staffId}>`
      : `======🙏 Thank you! DVA closed======`;

    await dvaChannel.send(closeMessage);

    const dealSnapshot = { ...ctx.deal };
    ctx.deal = null;
    clearDealFile(ctx.file);
    stopCloseReminder(key);

    // Log to Sheets now that we know who closed (handles split if different staff)
    if (dealSnapshot.released) {
      const closerId = isOverride ? staffId : null;
      await logDeal(dealSnapshot, closerId).catch(e => console.error("[DVA] Sheet log error:", e));
    }

    setTimeout(async () => {
      try {
        const dvaRole = guild.roles.cache.get(tempRoleId);
        const b = await guild.members.fetch(dealSnapshot.buyerId);
        const s = await guild.members.fetch(dealSnapshot.sellerId);
        await b.roles.remove(dvaRole);
        await s.roles.remove(dvaRole);
      } catch (e) { console.error("[DVA] Role removal error:", e); }
    }, 5000);

    const buySellChannel = guild.channels.cache.get(BUYSELL_CHANNEL_ID);
    if (buySellChannel) {
      await buySellChannel.send(`🔔 Previous DVA has concluded. You may tag Staff again for DVA.`);
    }

    return interaction.editReply({ content: "✅ Deal closed and logged to Google Sheets. Roles will be removed in 5 seconds." });
  }

  // ── /dva cancel ─────────────────────────────────────────────────────────────
  if (sub === "cancel") {
    if (!ctx.deal)                    return interaction.reply({ content: "❌ No active deal.", ephemeral: true });
    if (ctx.deal.staffId !== staffId) return interaction.reply({ content: "❌ You didn't start this deal.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const reason       = interaction.options.getString("reason") || "No reason provided";
    const dealSnapshot = { ...ctx.deal };
    ctx.deal = null;
    clearDealFile(ctx.file);
    stopCloseReminder(key);

    await dvaChannel.send(`❌ DVA deal cancelled.\n📝 Reason: ${reason}`);

    try {
      const dvaRole = guild.roles.cache.get(tempRoleId);
      const b = await guild.members.fetch(dealSnapshot.buyerId);
      const s = await guild.members.fetch(dealSnapshot.sellerId);
      await b.roles.remove(dvaRole);
      await s.roles.remove(dvaRole);
    } catch (e) { console.error("[DVA] Role removal error:", e); }

    return interaction.editReply({ content: "✅ Deal cancelled and roles removed." });
  }
});

// ─── STAFF MENTION LISTENER ───────────────────────────────────────────────────
client.on("messageCreate", async message => {
  if (message.author.bot) return;
  if (message.channel.id !== BUYSELL_CHANNEL_ID) return;
  if (!message.mentions.roles.has(STAFF_ROLE_ID)) return;
  if (!dealState.normal.deal && !dealState.cash.deal) return;

  await message.reply(
    `⏳ A DVA deal is currently in progress. Please wait and I will let you know once the ongoing deal is over.`
  );
});

// ─── GLOBAL ERROR HANDLERS (prevent crash on unhandled errors) ────────────────
process.on("unhandledRejection", err => console.error("[DVA] Unhandled rejection:", err));
process.on("uncaughtException",  err => console.error("[DVA] Uncaught exception:", err));

// ─── BOOT ─────────────────────────────────────────────────────────────────────
client.once("ready", async () => {
  console.log(`[DVA] Bot online as ${client.user.tag}`);
  await registerCommands();
  await checkMissedArchive().catch(e => console.error("[DVA] Startup archive check error:", e));

  // Restart close reminders for any deals that were released but never closed before restart
  for (const key of ["normal", "cash"]) {
    if (dealState[key].deal?.released) {
      console.log(`[DVA] Restarting close reminder for ${key} deal.`);
      startCloseReminder(key);
    }
  }
});

client.login(process.env.BOT_TOKEN);
