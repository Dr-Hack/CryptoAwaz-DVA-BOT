// DVA Bot - bot.js
// Version: 1.16
// Last Modified: 2026-06-05
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
const DVA_CHANNEL_ID     = process.env.DVA_CHANNEL_ID;
const DVA_TEMP_ROLE_ID   = process.env.DVA_TEMP_ROLE_ID;
const BUYSELL_CHANNEL_ID = process.env.BUYSELL_CHANNEL_ID;
const SHEET_ID           = process.env.SHEET_ID;
const FUND_LOG_TAB       = process.env.SHEET_TAB || "Fund Log";
const MONTHLY_TAB        = "Monthly Collection";
const BOOSTER_MIN_MONTHS = 3;
const BOOSTER_THRESHOLD  = 500;
const STAFF_ROLE_ID      = "831157132346130492";

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

// ─── LOG DEAL TO FUND LOG ─────────────────────────────────────────────────────
// Sheet columns: A=DealID | B=Date | C=Niazai | D=Nomy | E=SilentKiller | F=USDT Amount | G=Fee | H=Booster | I=Buyer | J=Seller
async function logDeal(deal) {
  const sheets    = getSheets();
  const staffInfo = STAFF[deal.staffId];
  const fee       = parseFloat((deal.amount * deal.feePercent / 100).toFixed(4));
  const staffShare= parseFloat((fee * 0.5).toFixed(4));
  const dealId    = await getNextDealId(sheets);
  const now       = new Date().toLocaleDateString("en-PK", { timeZone: "Asia/Karachi" });

  // Columns: A=DealID, B=Date, C=Niazai, D=Nomy, E=SilentKiller, F=USDT Amount, G=Fee, H=Booster, I=Buyer, J=Seller
  // colIndex: Niazai=1, Nomy=2, SilentKiller=3 → array index: C=2, D=3, E=4
  const row = Array(10).fill("");
  row[0] = dealId;                          // A - Deal ID
  row[1] = now;                             // B - Date
  row[staffInfo.colIndex + 1] = staffShare; // C/D/E - staff share (colIndex 1→idx2, 2→idx3, 3→idx4)
  row[5] = deal.amount;                     // F - USDT Amount
  row[6] = fee;                             // G - Fee
  row[7] = deal.booster ? `Yes (@${deal.boosterName})` : "No"; // H - Booster
  row[8] = `${deal.buyerName} (${deal.buyerId})`;   // I - Buyer
  row[9] = `${deal.sellerName} (${deal.sellerId})`; // J - Seller

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

// ─── MONTHLY ARCHIVE ──────────────────────────────────────────────────────────
async function archiveMonth() {
  const sheets = getSheets();
  const now    = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi" }));

  // Archive previous month
  const archiveDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthName   = archiveDate.toLocaleString("en-US", { month: "long", year: "numeric" }); // e.g. "May 2026"

  const rows = await getRange(sheets, `${FUND_LOG_TAB}!A:J`);
  if (rows.length <= 1) { console.log("[DVA] Nothing to archive."); return; }

  // Create archive tab if not exists
  const meta   = await getSheetMeta(sheets);
  const exists = meta.some(s => s.properties.title === monthName);
  if (!exists) await addTab(sheets, monthName);
  await writeRange(sheets, `${monthName}!A1`, rows);

  // Calc totals
  const dataRows = rows.filter(r => r[0] && !isNaN(r[0]));
  let niazai = 0, nomy = 0, silent = 0, volume = 0;
  for (const r of dataRows) {
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

  // Recalculate grand totals across all archive tabs
  const allMeta = await getSheetMeta(sheets);
  let gtNiazai = 0, gtNomy = 0, gtSilent = 0, gtVolume = 0;
  for (const sheet of allMeta) {
    const t = sheet.properties.title;
    if (t === FUND_LOG_TAB || t === MONTHLY_TAB) continue;
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

  // Clear Fund Log, keep headers
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${FUND_LOG_TAB}!A2:J1000`
  });
  await updateSummaryBlock(sheets);
  console.log(`[DVA] Archived ${monthName} successfully.`);
}

// ─── CRON: midnight PKT (19:00 UTC), runs on 1st of month ────────────────────
cron.schedule("0 19 * * *", async () => {
  const pkt = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi" }));
  if (pkt.getDate() === 1) {
    console.log("[DVA] Running monthly archive...");
    await archiveMonth().catch(e => console.error("[DVA] Archive error:", e));
  }
});

// ─── DEAL PERSISTENCE ────────────────────────────────────────────────────────
const fs        = require("fs");
const DEAL_FILE = "active_deal.json";
const MAX_DEAL_AGE_HOURS = 24;

function saveDeal(deal) {
  try {
    fs.writeFileSync(DEAL_FILE, JSON.stringify({ ...deal, savedAt: Date.now() }, null, 2));
  } catch (e) { console.error("[DVA] Failed to save deal:", e); }
}

function clearDealFile() {
  try {
    if (fs.existsSync(DEAL_FILE)) fs.unlinkSync(DEAL_FILE);
  } catch (e) { console.error("[DVA] Failed to clear deal file:", e); }
}

function loadDeal() {
  try {
    if (!fs.existsSync(DEAL_FILE)) return null;
    const deal = JSON.parse(fs.readFileSync(DEAL_FILE, "utf8"));
    const ageHours = (Date.now() - deal.savedAt) / (1000 * 60 * 60);
    if (ageHours > MAX_DEAL_AGE_HOURS) {
      console.log("[DVA] Stale deal found (>24hrs), discarding.");
      clearDealFile();
      return null;
    }
    console.log(`[DVA] Restored active deal from file (started by ${deal.staffId}).`);
    return deal;
  } catch (e) {
    console.error("[DVA] Failed to load deal file:", e);
    return null;
  }
}

// ─── ACTIVE DEAL (single global lock) ────────────────────────────────────────
// Only one deal can run at a time across the entire server
let activeDeal = loadDeal();

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
    )
    .addSubcommand(s => s
      .setName("confirm")
      .setDescription("Confirm USDT received and set escrow")
      .addNumberOption(o => o.setName("amount").setDescription("USDT amount received").setRequired(true))
    )
    .addSubcommand(s => s
      .setName("release")
      .setDescription("Release escrow and log to Google Sheets")
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

  const sub        = interaction.options.getSubcommand();
  const guild      = interaction.guild;
  const channel    = interaction.channel;
  const staffId    = interaction.user.id;
  const dvaChannel = guild.channels.cache.get(DVA_CHANNEL_ID);

  if (!STAFF[staffId]) {
    return interaction.reply({ content: "❌ You are not authorized to use DVA commands.", ephemeral: true });
  }

  // /dva start is allowed in #buy-sell OR #dva
  // All other commands are locked to #dva only
  if (sub === "start") {
    if (channel.id !== DVA_CHANNEL_ID && channel.id !== BUYSELL_CHANNEL_ID) {
      return interaction.reply({ content: `❌ DVA commands can only be used in <#${DVA_CHANNEL_ID}> or <#${BUYSELL_CHANNEL_ID}>.`, ephemeral: true });
    }
  } else {
    if (channel.id !== DVA_CHANNEL_ID) {
      return interaction.reply({ content: `❌ This command can only be used in <#${DVA_CHANNEL_ID}>.`, ephemeral: true });
    }
  }

  // ── /dva start ──────────────────────────────────────────────────────────────
  if (sub === "start") {
    if (activeDeal) {
      return interaction.reply({
        content: `⚠️ A deal is already in progress (started by <@${activeDeal.staffId}>). Close or cancel it first.`,
        ephemeral: true
      });
    }

    const buyer   = interaction.options.getMember("buyer");
    const seller  = interaction.options.getMember("seller");
    const dvaRole = guild.roles.cache.get(DVA_TEMP_ROLE_ID);

    if (!dvaRole) return interaction.reply({ content: "❌ DVA-Temp role not found. Check your .env.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    await buyer.roles.add(dvaRole);
    await seller.roles.add(dvaRole);

    // Wait for Discord to propagate role assignment before sending message
    await new Promise(r => setTimeout(r, 2000));

    activeDeal = {
      staffId,
      buyerId:      buyer.id,
      buyerName:    buyer.user.username,
      sellerId:     seller.id,
      sellerName:   seller.user.username,
      amount:       null,
      feePercent:   null,
      escrowAmount: null,
      booster:      null,
      boosterName:  null,
      released:     false
    };
    saveDeal(activeDeal);

    await dvaChannel.send(
      `<@&${DVA_TEMP_ROLE_ID}> — New DVA deal initiated by <@${staffId}>\n` +
      `👤 **Buyer:** <@${buyer.id}> *(Buying USDT)*\n` +
      `👤 **Seller:** <@${seller.id}> *(Selling USDT)*\n\n` +
      `${STAFF[staffId].message}`
    );

    const buySellChannel = guild.channels.cache.get(BUYSELL_CHANNEL_ID);
    if (buySellChannel) {
      await buySellChannel.send(
        `🎯 <@${buyer.id}> & <@${seller.id}> — Please head over to <#${DVA_CHANNEL_ID}> to proceed.`
      );
    }

    return interaction.editReply({ content: `✅ Deal started. DVA-Temp assigned to <@${buyer.id}> and <@${seller.id}>.` });
  }

  // ── /dva confirm ────────────────────────────────────────────────────────────
  if (sub === "confirm") {
    if (!activeDeal)                    return interaction.reply({ content: "❌ No active deal.", ephemeral: true });
    if (activeDeal.staffId !== staffId) return interaction.reply({ content: "❌ You didn't start this deal.", ephemeral: true });

    const amount    = interaction.options.getNumber("amount");
    activeDeal.amount = amount;

    if (amount >= BOOSTER_THRESHOLD) {
      const bMember = guild.members.cache.get(activeDeal.buyerId);
      const sMember = guild.members.cache.get(activeDeal.sellerId);
      const bMonths = getBoosterMonths(bMember);
      const sMonths = getBoosterMonths(sMember);
      const booster = bMonths >= BOOSTER_MIN_MONTHS ? bMember
                    : sMonths >= BOOSTER_MIN_MONTHS ? sMember : null;

      if (booster) {
        activeDeal.feePercent   = 0.5;
        activeDeal.booster      = booster.id;
        activeDeal.boosterName  = booster.user.username;
        activeDeal.escrowAmount = parseFloat((amount - amount * 0.005).toFixed(4));
        await dvaChannel.send(
          `✅ ${amount} USDT received\n` +
          `🔒 ${activeDeal.escrowAmount} USDT escrow\n\n` +
          `🎉 Booster discount applied for <@${booster.id}> — Fee: **0.5%**`
        );
      } else {
        activeDeal.feePercent   = 1;
        activeDeal.escrowAmount = parseFloat((amount - amount * 0.01).toFixed(4));
        await dvaChannel.send(
          `✅ ${amount} USDT received\n` +
          `🔒 ${activeDeal.escrowAmount} USDT escrow\n\n` +
          `📋 Fee: **1%**`
        );
      }
    } else {
      activeDeal.feePercent   = 1;
      activeDeal.escrowAmount = parseFloat((amount - amount * 0.01).toFixed(4));
      await dvaChannel.send(
        `✅ ${amount} USDT received\n` +
        `🔒 ${activeDeal.escrowAmount} USDT escrow`
      );
    }
    saveDeal(activeDeal);

    return interaction.reply({ content: "✅ Escrow confirmed.", ephemeral: true });
  }

  // ── /dva release ────────────────────────────────────────────────────────────
  if (sub === "release") {
    if (!activeDeal)                    return interaction.reply({ content: "❌ No active deal.", ephemeral: true });
    if (activeDeal.staffId !== staffId) return interaction.reply({ content: "❌ You didn't start this deal.", ephemeral: true });
    if (!activeDeal.escrowAmount)       return interaction.reply({ content: "❌ Run /dva confirm first.", ephemeral: true });
    if (activeDeal.released)            return interaction.reply({ content: "⚠️ Escrow has already been released for this deal. Use **/dva close** to wrap up.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    await dvaChannel.send(
      `✅ **Escrow Released!**\n` +
      `💵 Amount: ${activeDeal.amount} USDT\n` +
      `💸 Released: ${activeDeal.escrowAmount} USDT`
    );

    await logDeal(activeDeal).catch(e => console.error("[DVA] Sheet log error:", e));
    if (activeDeal) {
      activeDeal.released = true;
      saveDeal(activeDeal);
    }

    return interaction.editReply({ content: "✅ Escrow released and logged to Google Sheets." });
  }

  // ── /dva close ──────────────────────────────────────────────────────────────
  if (sub === "close") {
    if (!activeDeal)                    return interaction.reply({ content: "❌ No active deal.", ephemeral: true });
    if (activeDeal.staffId !== staffId) return interaction.reply({ content: "❌ You didn't start this deal.", ephemeral: true });

    // Warn if escrow was confirmed but not released
    if (activeDeal.escrowAmount && !activeDeal.released) {
      return interaction.reply({
        content: `⚠️ Escrow of **${activeDeal.escrowAmount} USDT** has not been released yet.\nPlease run **/dva release** first, or run **/dva cancel** if the deal fell through.`,
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    await dvaChannel.send(`======🙏 Thank you! DVA closed======`);

    const dealSnapshot = { ...activeDeal };
    activeDeal = null;
    clearDealFile();

    setTimeout(async () => {
      try {
        const dvaRole = guild.roles.cache.get(DVA_TEMP_ROLE_ID);
        const b = await guild.members.fetch(dealSnapshot.buyerId);
        const s = await guild.members.fetch(dealSnapshot.sellerId);
        await b.roles.remove(dvaRole);
        await s.roles.remove(dvaRole);
      } catch (e) { console.error("[DVA] Role removal error:", e); }
    }, 5000);

    const buySellChannel = guild.channels.cache.get(BUYSELL_CHANNEL_ID);
    if (buySellChannel) {
      await buySellChannel.send(
        `🔔 Previous DVA has concluded. You may tag Staff again for DVA.`
      );
    }

    return interaction.editReply({ content: "✅ Deal closed. Roles will be removed in 5 seconds." });
  }

  // ── /dva cancel ─────────────────────────────────────────────────────────────
  if (sub === "cancel") {
    if (!activeDeal)                    return interaction.reply({ content: "❌ No active deal.", ephemeral: true });
    if (activeDeal.staffId !== staffId) return interaction.reply({ content: "❌ You didn't start this deal.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const reason       = interaction.options.getString("reason") || "No reason provided";
    const dealSnapshot = { ...activeDeal };
    activeDeal = null;
    clearDealFile();

    await dvaChannel.send(`❌ DVA deal cancelled.\n📝 Reason: ${reason}`);

    try {
      const dvaRole = guild.roles.cache.get(DVA_TEMP_ROLE_ID);
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
  if (!activeDeal) return;

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
});

client.login(process.env.BOT_TOKEN);