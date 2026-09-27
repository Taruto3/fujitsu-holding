const STORAGE_KEY = "fujitsu-holding-v2";
const ids = ["holdingForm", "shares", "price", "marketValue", "sharesSummary", "priceSummary", "updatedAt", "priceDate", "refreshQuote", "saveState", "error", "units", "incentiveRate", "startMonth", "purchaseDay", "planPreview"];
const elements = Object.fromEntries(ids.map(id => [id === "holdingForm" ? "form" : id, document.querySelector(`#${id}`)]));
const numberFormat = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 6 });
const yenFormat = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
let quoteHistory = [];

function currentMonth() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" }); }
function parseNumber(value) {
  const normalized = String(value).replace(/[,，\s]/g, "").replace("．", ".");
  if (!normalized) return 0;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function emptyHolding() {
  return { shares: 0, price: 0, priceDate: null, updatedAt: null, plan: { units: 0, incentiveRate: 15, startMonth: currentMonth(), purchaseDay: 25 }, purchases: {} };
}
function loadHolding() {
  const fallback = emptyHolding();
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (!current) {
      const legacy = JSON.parse(localStorage.getItem("fujitsu-holding-v1"));
      if (legacy && typeof legacy === "object") {
        return { ...fallback, shares: Number(legacy.shares) || 0, price: Number(legacy.price) || 0, priceDate: legacy.priceDate || null, updatedAt: legacy.updatedAt || null };
      }
    }
    const value = JSON.parse(current);
    if (!value || typeof value !== "object") return fallback;
    return { shares: Number(value.shares) || 0, price: Number(value.price) || 0, priceDate: typeof value.priceDate === "string" ? value.priceDate : null, updatedAt: value.updatedAt || null, plan: { ...fallback.plan, ...(value.plan || {}) }, purchases: value.purchases && typeof value.purchases === "object" ? value.purchases : {} };
  } catch { return fallback; }
}
function saveHolding(holding) { localStorage.setItem(STORAGE_KEY, JSON.stringify(holding)); }
function totalShares(holding) { return holding.shares + Object.values(holding.purchases).reduce((sum, item) => sum + (Number(item.shares) || 0), 0); }
function render(holding) {
  const shares = totalShares(holding);
  const total = shares * holding.price;
  elements.marketValue.innerHTML = `${total > 0 ? yenFormat.format(Math.round(total)) : "—"}<span>円</span>`;
  elements.sharesSummary.textContent = `${numberFormat.format(shares)} 株`;
  elements.priceSummary.textContent = holding.price > 0 ? `${yenFormat.format(holding.price)} 円` : "— 円";
  elements.updatedAt.textContent = holding.updatedAt ? `終値データ更新 ${dateFormat.format(new Date(holding.updatedAt))}` : "終値を取得しています…";
  const monthly = Number(holding.plan.units) * 1000;
  const count = Object.keys(holding.purchases).length;
  elements.planPreview.textContent = holding.plan.units > 0 ? `毎月 ${holding.plan.units}口（${yenFormat.format(monthly)}円）＋奨励金 ${holding.plan.incentiveRate}% ／ 自動反映 ${count}回` : "口数を設定すると、開始月から取得株数を毎月自動で概算します。";
}
function monthSequence(start, end) {
  if (!/^\d{4}-\d{2}$/.test(start)) return [];
  const result = [];
  let [year, month] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);
  while (year < endYear || (year === endYear && month <= endMonth)) {
    result.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month === 13) { year += 1; month = 1; }
  }
  return result;
}
function applyMonthlyPlan(holding) {
  const plan = holding.plan;
  if (!(plan.units > 0) || !plan.startMonth || !quoteHistory.length) return 0;
  let added = 0;
  for (const month of monthSequence(plan.startMonth, currentMonth())) {
    if (holding.purchases[month]) continue;
    const target = `${month}-${String(plan.purchaseDay).padStart(2, "0")}`;
    const quote = quoteHistory.find(item => item.date >= target && item.date.startsWith(month));
    if (!quote) continue;
    const contribution = plan.units * 1000;
    const incentive = contribution * plan.incentiveRate / 100;
    holding.purchases[month] = { date: quote.date, price: quote.close, units: plan.units, contribution, incentive, shares: (contribution + incentive) / quote.close };
    added += 1;
  }
  if (added) saveHolding(holding);
  return added;
}
async function refreshQuote() {
  elements.refreshQuote.disabled = true;
  elements.updatedAt.textContent = "終値を取得しています…";
  try {
    const stamp = Date.now();
    const [quoteResponse, historyResponse] = await Promise.all([fetch(`./data/quote.json?t=${stamp}`, { cache: "no-store" }), fetch(`./data/history.json?t=${stamp}`, { cache: "no-store" })]);
    if (!quoteResponse.ok || !historyResponse.ok) throw new Error("Quote fetch failed");
    const quote = await quoteResponse.json();
    quoteHistory = await historyResponse.json();
    if (!Number.isFinite(quote.close) || quote.close <= 0) throw new Error("Invalid quote");
    const holding = loadHolding();
    holding.price = quote.close; holding.priceDate = quote.date; holding.updatedAt = quote.fetchedAt || new Date().toISOString();
    const added = applyMonthlyPlan(holding);
    saveHolding(holding);
    elements.price.value = quote.close;
    elements.priceDate.textContent = `${quote.date} 終値`;
    render(holding);
    if (added) elements.saveState.textContent = `${added}か月分を自動反映しました`;
  } catch {
    const holding = loadHolding();
    elements.updatedAt.textContent = holding.price > 0 ? "自動取得できないため、保存済みの終値を表示中" : "終値を取得できませんでした";
  } finally { elements.refreshQuote.disabled = false; }
}
function initialize() {
  const holding = loadHolding();
  elements.shares.value = holding.shares || ""; elements.price.value = holding.price || "";
  elements.priceDate.textContent = holding.priceDate ? `${holding.priceDate} 終値` : "自動取得";
  elements.units.value = holding.plan.units || ""; elements.incentiveRate.value = holding.plan.incentiveRate;
  elements.startMonth.value = holding.plan.startMonth; elements.purchaseDay.value = holding.plan.purchaseDay;
  render(holding); refreshQuote();
}
elements.form.addEventListener("submit", event => {
  event.preventDefault();
  const shares = parseNumber(elements.shares.value), units = parseNumber(elements.units.value), incentiveRate = parseNumber(elements.incentiveRate.value), purchaseDay = parseNumber(elements.purchaseDay.value);
  if ([shares, units, incentiveRate, purchaseDay].includes(null) || !Number.isInteger(units) || !Number.isInteger(purchaseDay) || purchaseDay < 1 || purchaseDay > 28 || incentiveRate > 15) {
    elements.error.textContent = "口数は整数、反映日は1〜28日、奨励金率は0〜15%で入力してください。"; return;
  }
  const holding = loadHolding();
  holding.shares = shares;
  holding.plan = { units, incentiveRate, startMonth: elements.startMonth.value || currentMonth(), purchaseDay };
  applyMonthlyPlan(holding); saveHolding(holding);
  elements.error.textContent = ""; elements.saveState.textContent = "保存しました"; render(holding);
  window.setTimeout(() => { elements.saveState.textContent = ""; }, 2600);
});
elements.refreshQuote.addEventListener("click", refreshQuote);
initialize();
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./service-worker.js").catch(() => {});
