// DVA Bot - /fee command
// Version: 2.0
// Last Modified: 2026-06-07
// Dependencies: discord.js@14
// Purpose: Escrow fee calculator, mobile-first. Shows effective PKR/USDT rate
//          for buyer and seller across all 3 fee scenarios as a compact table.
//          Two buttons (runner-locked):
//            - Toggle Standard (1%) <-> Booster (0.5%)
//            - Toggle compact rate table <-> detailed breakdown
//          Locked to the buy-sell role.
//
// The DVA fee is ALWAYS deducted from the crypto (USDT). PKR is the adjustment.
//   - Fee on buyer : buyer pays full PKR, receives less USDT  -> buyer bears it
//   - Fee on seller: buyer pays less PKR, seller sends full   -> seller bears it
//   - Fee split    : fee halved, each side carries half       -> both share
//
// Integration: see the block at the bottom of this file.

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

// --- Config -----------------------------------------------------------------
const STANDARD_FEE  = 0.01;   // 1%
const BOOSTER_FEE   = 0.005;  // 0.5%
const FAQ_URL       = 'https://cryptocurrencypakistan.org/help/how-to-calculate-dva-fee/';
const EMBED_COLOR   = 0xF0B132; // brand gold
const BUYSELL_ROLE  = '1103094651092729946'; // only members with this role can use /fee
const COLLECTOR_MS  = 5 * 60 * 1000; // buttons stay live for 5 minutes

// --- Formatting helpers -----------------------------------------------------
function pkr(n) {
  return '\u20A8' + n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function usdtFmt(n) {
  return Number(n.toFixed(4)).toString();
}
function rate(n) {
  return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Colour dot based on how effective rate compares to posted rate.
function dot(effective, posted) {
  const diff = Math.abs(effective - posted);
  if (diff < 0.005) return '\uD83D\uDFE2';                  // green - at posted
  if (diff <= posted * 0.005 + 0.005) return '\uD83D\uDFE1'; // yellow - slight
  return '\uD83D\uDD34';                                     // red - bears fee
}

// --- Core calculation -------------------------------------------------------
// Rates measured against the actual USDT each party parts with / receives.
function calc(amount, postedRate, scenario, feePct) {
  const feeUSDT = amount * feePct;
  const base    = amount * postedRate;

  let buyerPKR, sellerPKR, buyerUSDT;

  if (scenario === 'buyer') {
    buyerUSDT = amount - feeUSDT;
    buyerPKR  = base;
    sellerPKR = base;
  } else if (scenario === 'seller') {
    buyerUSDT = amount - feeUSDT;
    buyerPKR  = (amount - feeUSDT) * postedRate;
    sellerPKR = (amount - feeUSDT) * postedRate;
  } else { // split
    buyerUSDT = amount - feeUSDT;
    buyerPKR  = (amount - feeUSDT / 2) * postedRate;
    sellerPKR = (amount - feeUSDT / 2) * postedRate;
  }

  return {
    buyerPKR,
    sellerPKR,
    buyerUSDT,
    buyerRate:  buyerPKR / buyerUSDT,
    sellerRate: sellerPKR / amount,
  };
}

const SCENARIOS = [
  { key: 'buyer',  label: '\uD83D\uDD3A Fee on buyer'  },
  { key: 'seller', label: '\uD83D\uDD3B Fee on seller' },
  { key: 'split',  label: '\u2702\uFE0F Fee split'      },
];

// --- Embed builders ---------------------------------------------------------
// Compact view: each scenario listed inline with both rates clearly labeled.
// No matrix -> no Buyer-row / Buyer-column ambiguity.
function buildCompact(amount, postedRate, booster) {
  const feePct   = booster ? BOOSTER_FEE : STANDARD_FEE;
  const tierName = booster ? 'Booster fee \u00B7 0.5%' : 'Standard fee \u00B7 1%';

  const blocks = SCENARIOS.map(s => {
    const d = calc(amount, postedRate, s.key, feePct);
    return (
      `${s.label}\n` +
      `\u2003${dot(d.buyerRate, postedRate)} Buyer \`${rate(d.buyerRate)}\`` +
      `\u2003\u2003${dot(d.sellerRate, postedRate)} Seller \`${rate(d.sellerRate)}\``
    );
  }).join('\n\n');

  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle('\uD83E\uDDEE DVA Fee Calculator')
    .setDescription(
      `**${usdtFmt(amount)} USDT** @ **${rate(postedRate)}** PKR/USDT\n` +
      `*${tierName}* \u2014 effective PKR/USDT rate\n\n` +
      blocks + '\n\n' +
      '\uD83D\uDFE2 at posted \u00B7 \uD83D\uDFE1 slight diff \u00B7 \uD83D\uDD34 bears the fee\n' +
      `[Fee Calculation FAQ](${FAQ_URL})`,
    )
    .setFooter({ text: 'Tap Detailed view for the full PKR & USDT breakdown' });
}

// Detailed view: full PKR + USDT breakdown per scenario, for current tier.
function buildDetailed(amount, postedRate, booster) {
  const feePct   = booster ? BOOSTER_FEE : STANDARD_FEE;
  const tierName = booster ? 'Booster fee \u00B7 0.5%' : 'Standard fee \u00B7 1%';
  const eachNote = booster ? ' (0.25% each)' : ' (0.5% each)';

  const fields = SCENARIOS.map(s => {
    const d = calc(amount, postedRate, s.key, feePct);
    const splitTag = s.key === 'split' ? eachNote : '';
    const value =
      `${dot(d.buyerRate, postedRate)} **Buyer** \u2014 pays ${pkr(d.buyerPKR)} \u00B7 gets ${usdtFmt(d.buyerUSDT)} USDT\n` +
      `\u2003\u2003\u21B3 effective \`${rate(d.buyerRate)}\` PKR/USDT\n` +
      `${dot(d.sellerRate, postedRate)} **Seller** \u2014 sends ${usdtFmt(amount)} \u00B7 gets ${pkr(d.sellerPKR)}\n` +
      `\u2003\u2003\u21B3 effective \`${rate(d.sellerRate)}\` PKR/USDT`;
    return { name: `${s.label}${splitTag}`, value };
  });

  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle('\uD83E\uDDEE DVA Fee Calculator \u2014 detailed')
    .setDescription(`**${usdtFmt(amount)} USDT** @ **${rate(postedRate)}** PKR/USDT\n*${tierName}*`)
    .addFields(...fields)
    .addFields({
      name: '\u200B',
      value:
        '\uD83D\uDFE2 at posted rate \u00B7 \uD83D\uDFE1 slight diff \u00B7 \uD83D\uDD34 bears the fee\n' +
        `[Fee Calculation FAQ](${FAQ_URL})`,
    })
    .setFooter({ text: 'Rates shown are effective PKR/USDT after the DVA fee' });
}

// Build the two-button row reflecting current state.
function buildButtons(booster, detailed) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('fee_tier')
      .setLabel(booster ? 'Show standard rates (1%)' : 'Show booster rates (0.5%)')
      .setEmoji(booster ? '\uD83D\uDCB0' : '\uD83D\uDE80')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('fee_detail')
      .setLabel(detailed ? 'Compact view' : 'Detailed view')
      .setEmoji(detailed ? '\uD83D\uDCCA' : '\uD83D\uDCCB')
      .setStyle(ButtonStyle.Secondary),
  );
}

function render(amount, postedRate, booster, detailed) {
  const embed = detailed
    ? buildDetailed(amount, postedRate, booster)
    : buildCompact(amount, postedRate, booster);
  return { embeds: [embed], components: [buildButtons(booster, detailed)] };
}

// --- Command definition -----------------------------------------------------
const data = new SlashCommandBuilder()
  .setName('fee')
  .setDescription('Calculate DVA escrow fee \u2014 effective PKR rate for buyer & seller')
  .addNumberOption(opt =>
    opt.setName('usdt')
      .setDescription('USDT amount of the deal (e.g. 100)')
      .setRequired(true)
      .setMinValue(0.0001))
  .addNumberOption(opt =>
    opt.setName('rate')
      .setDescription('Posted PKR per USDT rate (e.g. 285)')
      .setRequired(true)
      .setMinValue(0.0001));

async function execute(interaction) {
  // Role lock: only members with the buy-sell role.
  if (!interaction.member.roles.cache.has(BUYSELL_ROLE)) {
    await interaction.reply({
      content: `\u274C This command is only available to members with the <@&${BUYSELL_ROLE}> role.`,
      ephemeral: true,
    });
    return;
  }

  const amount     = interaction.options.getNumber('usdt');
  const postedRate = interaction.options.getNumber('rate');
  const runnerId   = interaction.user.id;

  // View state lives in closure for this one message.
  let booster  = false;
  let detailed = false;

  await interaction.reply(render(amount, postedRate, booster, detailed));
  const message = await interaction.fetchReply();

  const collector = message.createMessageComponentCollector({ time: COLLECTOR_MS });

  collector.on('collect', async btn => {
    // Runner lock: only the person who ran /fee may change the view.
    if (btn.user.id !== runnerId) {
      await btn.reply({
        content: '\u274C Run `/fee` yourself first.',
        ephemeral: true,
      });
      return;
    }

    if (btn.customId === 'fee_tier')   booster  = !booster;
    if (btn.customId === 'fee_detail') detailed = !detailed;

    await btn.update(render(amount, postedRate, booster, detailed));
  });

  collector.on('end', async () => {
    // Disable buttons when the collector expires so they don't look clickable.
    try {
      const dead = buildButtons(booster, detailed);
      dead.components.forEach(c => c.setDisabled(true));
      await message.edit({ components: [dead] });
    } catch (_) { /* message may have been deleted; ignore */ }
  });
}

module.exports = { data, execute, calc };

/* ===========================================================================
   INTEGRATION (Option A) — add to dva_bot.js WITHOUT touching existing DVA logic.

   Place fee-command.js next to dva_bot.js, then make these 3 additions.

   1) Near the top, after the existing discord.js require (line ~8):

        const feeCommand = require("./fee-command.js");

   2) In the `commands` array. Your array ends with:

            )
        ].map(c => c.toJSON());

      Change it to (add a comma + feeCommand.data as a RAW builder, because
      your .map already calls .toJSON() on every item -- do NOT pre-serialize):

            ),
          feeCommand.data
        ].map(c => c.toJSON());

   3) Inside the interactionCreate handler. Your handler opens with a guard
      that returns on anything that isn't "dva", so the fee route MUST go
      ABOVE that guard:

        client.on("interactionCreate", async interaction => {
          if (interaction.isChatInputCommand() && interaction.commandName === "fee") {
            return feeCommand.execute(interaction);
          }

          if (!interaction.isChatInputCommand() || interaction.commandName !== "dva") return;
          ...rest of your existing DVA handler unchanged...

   NOTE on the buttons: this command handles its own button clicks via an
   internal collector scoped to the message it sends. It does NOT route button
   interactions through your global interactionCreate handler, so there is no
   conflict with DVA. The collector auto-expires after 5 minutes and disables
   the buttons. Restart the bot after adding so /fee registers with Discord.
   =========================================================================== */