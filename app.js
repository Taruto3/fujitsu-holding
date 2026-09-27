const STORAGE_KEY = "fujitsu-holding-v1";

const elements = {
  form: document.querySelector("#holdingForm"),
  shares: document.querySelector("#shares"),
  price: document.querySelector("#price"),
  marketValue: document.querySelector("#marketValue"),
  sharesSummary: document.querySelector("#sharesSummary"),
  priceSummary: document.querySelector("#priceSummary"),
  updatedAt: document.querySelector("#updatedAt"),
  priceDate: document.querySelector("#priceDate"),
  refreshQuote: document.querySelector("#refreshQuote"),
  saveState: document.querySelector("#saveState"),
  error: document.querySelector("#error")
};

const numberFormat = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 4 });
const yenFormat = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
});

function parseNumber(value) {
  const normalized = value.replace(/[,，\s]/g, "").replace("．", ".");
  if (!normalized) return 0;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function loadHolding() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!value || typeof value !== "object") return { shares: 0, price: 0, priceDate: null, updatedAt: null };
    return {
      shares: Number(value.shares) || 0,
      price: Number(value.price) || 0,
      priceDate: typeof value.priceDate === "string" ? value.priceDate : null,
      updatedAt: value.updatedAt || null
    };
  } catch {
    return { shares: 0, price: 0, priceDate: null, updatedAt: null };
  }
}

function render(holding) {
  const total = holding.shares * holding.price;
  elements.marketValue.innerHTML = `${total > 0 ? yenFormat.format(Math.round(total)) : "—"}<span>円</span>`;
  elements.sharesSummary.textContent = `${numberFormat.format(holding.shares)} 株`;
  elements.priceSummary.textContent = holding.price > 0 ? `${yenFormat.format(holding.price)} 円` : "— 円";
  elements.updatedAt.textContent = holding.updatedAt
    ? `最終更新 ${dateFormat.format(new Date(holding.updatedAt))}`
    : "まだ保存されていません";
}

async function refreshQuote() {
  elements.refreshQuote.disabled = true;
  elements.updatedAt.textContent = "終値を取得しています…";
  try {
    const response = await fetch(`./data/quote.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const quote = await response.json();
    if (!Number.isFinite(quote.close) || quote.close <= 0) throw new Error("Invalid quote");

    const holding = loadHolding();
    holding.price = quote.close;
    holding.priceDate = quote.date;
    holding.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(holding));
    elements.price.value = quote.close;
    elements.priceDate.textContent = `${quote.date} 終値`;
    render(holding);
  } catch {
    const holding = loadHolding();
    elements.updatedAt.textContent = holding.price > 0
      ? "自動取得できないため、保存済みの終値を表示中"
      : "終値を取得できませんでした";
  } finally {
    elements.refreshQuote.disabled = false;
  }
}

function initialize() {
  const holding = loadHolding();
  elements.shares.value = holding.shares || "";
  elements.price.value = holding.price || "";
  elements.priceDate.textContent = holding.priceDate ? `${holding.priceDate} 終値` : "自動取得";
  render(holding);
  refreshQuote();
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const shares = parseNumber(elements.shares.value);
  const price = parseNumber(elements.price.value);

  if (shares === null || price === null) {
    elements.error.textContent = "0以上の数値を入力してください。";
    return;
  }

  const previous = loadHolding();
  const holding = { shares, price, priceDate: previous.priceDate || null, updatedAt: previous.updatedAt || new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(holding));
  elements.error.textContent = "";
  elements.saveState.textContent = "保存しました";
  render(holding);
  window.setTimeout(() => { elements.saveState.textContent = ""; }, 2200);
});

initialize();
elements.refreshQuote.addEventListener("click", refreshQuote);

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}
