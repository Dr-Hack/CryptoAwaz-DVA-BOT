// clear-commands.js — remove an app's slash commands from the guild.
//
// Written for the stopgap-bot period: the old app cannot log in (its privileged
// intents were revoked pending review), but its /dva and /fee stay registered on
// Discord's side and keep appearing in the picker, where they answer with
// "The application did not respond". Kicking the old app would fix that too, but
// an app in zero servers has zero users — which may close the intent review that
// is the whole reason for the stopgap. So this clears the commands and leaves
// the app installed.
//
// Add the old app's credentials to .env alongside the new ones:
//   OLD_BOT_TOKEN=...
//   OLD_CLIENT_ID=...
// then, on the machine that runs the bot:
//
//   node tools/clear-commands.js          # list what would be removed
//   node tools/clear-commands.js --yes    # actually remove them
//
// Nothing else is touched: the app stays in the server, keeps its roles, and its
// commands come back the moment it runs registerCommands() again.

require("dotenv").config();
const { REST, Routes } = require("discord.js");

const TOKEN     = process.env.OLD_BOT_TOKEN;
const CLIENT_ID = process.env.OLD_CLIENT_ID;
const GUILD_ID  = process.env.GUILD_ID;
const CONFIRMED = process.argv.includes("--yes");

function die(msg) { console.error(`❌ ${msg}`); process.exit(1); }

if (!TOKEN)     die("OLD_BOT_TOKEN is not set in .env — add the old app's bot token.");
if (!CLIENT_ID) die("OLD_CLIENT_ID is not set in .env — add the old app's Application ID.");
if (!GUILD_ID)  die("GUILD_ID is not set in .env.");

// Guard against the obvious mistake: pointing this at the app that is currently
// running and wiping the commands staff are relying on.
if (CLIENT_ID === process.env.CLIENT_ID) {
  die("OLD_CLIENT_ID matches CLIENT_ID — that is the app in use. Check .env.");
}

(async () => {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  let existing;
  try {
    existing = await rest.get(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID));
  } catch (e) {
    // 401 means the token is wrong or was reset; 403/404 means this app is not
    // in that guild — both are worth saying plainly rather than as a stack trace.
    const code = e.status || e.code;
    if (code === 401) die("Token rejected. The old token may have been reset in the Developer Portal.");
    if (code === 403 || code === 404) die(`App ${CLIENT_ID} has no commands in guild ${GUILD_ID} — nothing to clear.`);
    die(`Could not read commands: ${e.message}`);
  }

  if (!existing.length) {
    console.log(`✅ App ${CLIENT_ID} already has no guild commands registered. Nothing to do.`);
    return;
  }

  console.log(`Found ${existing.length} command(s) registered by app ${CLIENT_ID}:`);
  for (const c of existing) console.log(`   /${c.name} — ${c.description || "(no description)"}`);

  if (!CONFIRMED) {
    console.log(`\nDry run. Re-run with --yes to remove them:\n   node tools/clear-commands.js --yes`);
    return;
  }

  // An empty array is Discord's "these are now all of this app's commands".
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
  console.log(`\n✅ Removed. The old app stays in the server; only its commands are gone.`);
  console.log(`   Discord clients can take a minute to stop showing them.`);
})().catch(e => die(e.message));
