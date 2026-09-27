import { mkdir, readFile, writeFile } from "node:fs/promises";

const endpoint = "https://query1.finance.yahoo.com/v8/finance/chart/6702.T?interval=1d&range=1mo";

function tokyoParts(date = new Date()) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(date).map(part => [part.type, part.value]));
}

function tokyoDateFromUnix(seconds) {
  const value = tokyoParts(new Date(seconds * 1000));
  return `${value.year}-${value.month}-${value.day}`;
}

const response = await fetch(endpoint, {
  headers: { "User-Agent": "Mozilla/5.0 FujitsuHoldingPages/2.0" }
});
if (!response.ok) throw new Error(`Quote upstream returned ${response.status}`);

const data = await response.json();
const result = data?.chart?.result?.[0];
const timestamps = result?.timestamp || [];
const closes = result?.indicators?.quote?.[0]?.close || [];
const now = tokyoParts();
const today = `${now.year}-${now.month}-${now.day}`;
const beforeOfficialClose = Number(now.hour) < 15 || (Number(now.hour) === 15 && Number(now.minute) < 30);
const rows = timestamps.map((timestamp, index) => ({
  date: tokyoDateFromUnix(timestamp), close: closes[index]
})).filter(row => Number.isFinite(row.close) && !(beforeOfficialClose && row.date === today));

const latest = rows.at(-1);
if (!latest) throw new Error("No completed daily close found");

const quote = {
  symbol: "6702.T",
  currency: "JPY",
  date: latest.date,
  close: latest.close,
  source: "Yahoo Finance",
  fetchedAt: new Date().toISOString()
};

await mkdir("data", { recursive: true });
await writeFile("data/quote.json", `${JSON.stringify(quote, null, 2)}\n`);
let history = [];
try { history = JSON.parse(await readFile("data/history.json", "utf8")); } catch {}
history = history.filter(item => item.date !== quote.date);
history.push({ date: quote.date, close: quote.close });
history.sort((a, b) => a.date.localeCompare(b.date));
await writeFile("data/history.json", `${JSON.stringify(history.slice(-400), null, 2)}\n`);
console.log(`Updated ${quote.symbol}: ${quote.date} close ${quote.close} ${quote.currency}`);
