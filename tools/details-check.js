// details-check.js — read-only inspector for the Details Log tab.
// Shows exactly what the bot sees for a given Discord user, so a "why did/didn't
// this row get written" question can be answered from data instead of guesswork.
//
//   node tools/details-check.js                     # health check on the whole tab
//   node tools/details-check.js <uid> [<uid> ...]   # plus a per-person breakdown
//
// Writes nothing. Safe to run at any time, including during a live deal.

require("dotenv").config();
const { google } = require("googleapis");

const SHEET_ID    = process.env.SHEET_ID;
const DETAILS_TAB = "Details Log";
const DCOL = { NAME: 0, VERIFIED: 1, UID: 2, TITLE: 3, BANK: 4, RELATION: 5,
               ACCOUNT: 6, IBAN: 7, BINANCE_ID: 8, BINANCE_NAME: 9, PHONE: 10, COMMENTS: 11 };
const HEADERS = ["Name", "Verified", "UID", "Title", "Bank", "Relation",
                 "Account", "IBAN", "BinanceID", "BinanceName", "Phone", "Comments"];

const cell = (r, i) => String(r[i] ?? "").trim();

(async () => {
  const auth = new google.auth.GoogleAuth({
    keyFile: "credentials.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });
  const sheets = google.sheets({ version: "v4", auth });

  const res  = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID, range: `${DETAILS_TAB}!A2:L`
  });
  const rows = res.data.values || [];
  console.log(`\n${DETAILS_TAB}: ${rows.length} data rows (sheet rows 2–${rows.length + 1})\n`);

  // ── Health check ───────────────────────────────────────────────────────────
  // A Discord ID is 17–19 digits. Google Sheets keeps only ~15 significant
  // digits for numeric cells, so a UID column formatted as Number silently
  // corrupts every ID and the bot then matches nobody. This is the single most
  // damaging thing that can go wrong with this sheet, so check it first.
  const problems = [];
  rows.forEach((r, i) => {
    const rowNum = i + 2;
    const uid    = cell(r, DCOL.UID);
    if (!uid) { problems.push(`row ${rowNum}: no UID — bot can never match this row`); return; }
    if (/e\+/i.test(uid))            problems.push(`row ${rowNum}: UID in scientific notation (${uid}) — format column C as Plain text`);
    else if (!/^\d{17,19}$/.test(uid)) problems.push(`row ${rowNum}: UID "${uid}" is not 17–19 digits`);
    else if (/0{4}$/.test(uid))      problems.push(`row ${rowNum}: UID "${uid}" ends in four zeros — likely truncated by numeric formatting`);
  });

  if (problems.length) {
    console.log("⚠️  Problems found:");
    problems.forEach(p => console.log("    " + p));
  } else {
    console.log("✅ Every UID looks intact (17–19 digits, stored as text).");
  }

  const written = rows.filter(r => cell(r, DCOL.PHONE) || cell(r, DCOL.COMMENTS)).length;
  console.log(`\nℹ️  ${written} row(s) have Phone or Comments filled. The bot never writes`);
  console.log(`    those two columns, so those rows were entered by hand.\n`);

  // ── Per-person breakdown ───────────────────────────────────────────────────
  const uids = process.argv.slice(2);
  if (!uids.length) {
    console.log("Pass one or more Discord user IDs for a per-person breakdown.\n");
    return;
  }

  for (const uid of uids) {
    const mine = rows.map((r, i) => ({ r, rowNum: i + 2 })).filter(({ r }) => cell(r, DCOL.UID) === uid);
    console.log("─".repeat(72));
    console.log(`UID ${uid} — ${mine.length} row(s)\n`);

    if (!mine.length) {
      console.log("  No rows. A seller here would get a fresh row; a buyer likewise.\n");
      continue;
    }

    for (const { r, rowNum } of mine) {
      console.log(`  row ${rowNum}:`);
      HEADERS.forEach((h, i) => {
        const v = cell(r, i);
        if (v) console.log(`    ${h.padEnd(12)} ${v}`);
      });
      console.log("");
    }

    // Mirror the bot's own filters so the output matches its behaviour exactly.
    const asSeller = mine.filter(({ r }) => cell(r, DCOL.ACCOUNT));
    const asBuyer  = mine.filter(({ r }) => cell(r, DCOL.BINANCE_ID));
    console.log(`  Offered as saved SELLER accounts: ${asSeller.length ? asSeller.map(m => `row ${m.rowNum} (${cell(m.r, DCOL.BANK)})`).join(", ") : "none — needs an Account Number"}`);
    console.log(`  Offered as saved BUYER accounts:  ${asBuyer.length  ? asBuyer.map(m => `row ${m.rowNum} (${cell(m.r, DCOL.BINANCE_ID)})`).join(", ") : "none — needs a Binance ID"}`);
    console.log(`  A new Binance ID would fill/append on rows: ${mine.map(m => m.rowNum).join(", ")}\n`);
  }
})().catch(e => { console.error("Error:", e.message); process.exit(1); });
