import { useCallback, useEffect, useMemo, useState } from "react";
import { getRates } from "./lib/api.js";

const CURRENCIES = [
  { code: "USD", name: "US Dollar", flag: "🇺🇸" },
  { code: "EUR", name: "Euro", flag: "🇪🇺" },
  { code: "GBP", name: "British Pound", flag: "🇬🇧" },
  { code: "INR", name: "Indian Rupee", flag: "🇮🇳" },
  { code: "JPY", name: "Japanese Yen", flag: "🇯🇵" },
  { code: "AUD", name: "Australian Dollar", flag: "🇦🇺" },
  { code: "CAD", name: "Canadian Dollar", flag: "🇨🇦" },
  { code: "CHF", name: "Swiss Franc", flag: "🇨🇭" },
  { code: "SGD", name: "Singapore Dollar", flag: "🇸🇬" },
  { code: "AED", name: "UAE Dirham", flag: "🇦🇪" },
  { code: "NZD", name: "New Zealand Dollar", flag: "🇳🇿" },
  { code: "CNY", name: "Chinese Yuan", flag: "🇨🇳" },
];

const DISPLAY_ORDER = [
  "INR",
  "EUR",
  "GBP",
  "JPY",
  "AUD",
  "CAD",
  "CHF",
  "SGD",
  "AED",
  "NZD",
  "CNY",
  "USD",
];

function formatRate(value) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumSignificantDigits: 7,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatMoney(value, currency) {
  if (!Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${formatRate(value)} ${currency}`;
  }
}

function formatDate(dateString) {
  if (!dateString) return "Date unavailable";
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateTime(dateString) {
  if (!dateString) return "Not available";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getCurrency(code) {
  return CURRENCIES.find((currency) => currency.code === code) ?? { code, name: code, flag: "💱" };
}

function FreshnessBadge({ data }) {
  const status = data?.isLastKnown ? "stale" : data?.freshness?.status || "fresh";
  const label = data?.isLastKnown
    ? "Last known"
    : status === "delayed"
      ? "Delayed"
      : status === "stale"
        ? "Stale"
        : "Within update window";

  return (
    <span className={`freshness-badge freshness-${status}`}>
      <span className="freshness-dot" />
      {label}
    </span>
  );
}

function Header({ data }) {
  return (
    <header className="topbar">
      <a className="brand" href="#top" aria-label="ClearFX home">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M4 8h14m0 0-3-3m3 3-3 3M20 16H6m0 0 3-3m-3 3 3 3"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span>
          clear<span className="brand-accent">fx</span>
        </span>
      </a>

      <div className="topbar-right">
        <span className="topbar-label">DAILY RATE SERVICE</span>
        <span className="live-indicator">
          <span /> PUBLIC DATA
        </span>
        {data && <span className="topbar-updated">Updated {formatDateTime(data.fetchedAt)}</span>}
      </div>
    </header>
  );
}

function RateCard({ currency, rate, base, rateDate }) {
  const details = getCurrency(currency);
  return (
    <article className="rate-card">
      <div className="rate-card-top">
        <div className="currency-identity">
          <span className="currency-flag" aria-hidden="true">
            {details.flag}
          </span>
          <div>
            <p className="currency-code">{currency}</p>
            <p className="currency-name">{details.name}</p>
          </div>
        </div>
        <span className="rate-direction">↗</span>
      </div>
      <div className="rate-value-row">
        <span className="rate-value">{formatRate(rate)}</span>
      </div>
      <p className="rate-caption">
        1 {base} = {formatRate(rate)} {currency}
      </p>
      <p className="rate-date-caption">As of {formatDate(rateDate)}</p>
    </article>
  );
}

function App() {
  const [base, setBase] = useState("USD");
  const [target, setTarget] = useState("INR");
  const [amount, setAmount] = useState("1");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastChecked, setLastChecked] = useState(null);

  const loadRates = useCallback(
    async ({ signal, isRefresh = false } = {}) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");

      try {
        const symbols = DISPLAY_ORDER.filter((code) => code !== base);
        const result = await getRates({ base, symbols, signal });
        setData(result);
        setLastChecked(new Date().toISOString());
      } catch (requestError) {
        if (requestError.name !== "AbortError") {
          setError(requestError.message || "Unable to load exchange rates.");
          if (!isRefresh) {
            setData(null);
          } else {
            setData((previous) =>
              previous
                ? {
                    ...previous,
                    isLastKnown: true,
                    cacheStatus: "stale",
                    warning:
                      "The latest refresh failed. Showing the last rates this screen received.",
                    freshness: {
                      ...previous.freshness,
                      status: "stale",
                      label: "Refresh failed",
                      message: "The latest refresh failed, so these values may now be out of date.",
                    },
                  }
                : previous,
            );
          }
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [base],
  );

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    loadRates({ signal: controller.signal });
    return () => controller.abort();
  }, [loadRates]);

  const availableRates = useMemo(() => {
    if (!data?.rates) return [];
    return DISPLAY_ORDER.filter((code) => code !== base && Number.isFinite(data.rates[code])).map(
      (code) => ({ code, rate: data.rates[code] }),
    );
  }, [data, base]);

  useEffect(() => {
    if (target === base) {
      const nextTarget = DISPLAY_ORDER.find((code) => code !== base && data?.rates?.[code] != null);
      if (nextTarget) setTarget(nextTarget);
    }
  }, [base, target, data]);

  const converted = Number(amount) * (data?.rates?.[target] ?? NaN);

  const swapCurrencies = () => {
    // Carry the visible conversion result into the input before reversing the pair.
    // Keep an empty input empty rather than turning it into zero.
    if (amount.trim() !== "" && Number.isFinite(converted)) {
      setAmount(String(converted));
    }

    setBase(target);
    setTarget(base);
  };

  const isWarning =
    data &&
    (data.isLastKnown ||
      data.freshness?.status === "delayed" ||
      data.freshness?.status === "stale");

  return (
    <div className="app-shell" id="top">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="page-wrap">
        <Header data={data} />

        <main>
          <section className="hero-section">
            <div className="hero-copy">
              <div className="eyebrow">
                <span className="eyebrow-line" /> CLEARER CURRENCY DATA
              </div>
              <h1>
                Rates you can trust.
                <br />
                <span>Freshness you can see.</span>
              </h1>
              <p className="hero-description">
                Straightforward exchange rates, backed by public data sources and honest update
                timestamps.
              </p>
            </div>
            <div className="hero-note">
              <span className="hero-note-icon">✳</span>
              <div>
                <p className="hero-note-title">A note on freshness</p>
                <p>
                  These are daily reference rates, not live trading quotes. We always show the date
                  behind the number.
                </p>
              </div>
            </div>
          </section>

          <section className="overview-grid" aria-label="Exchange rate overview">
            <div className="panel converter-panel">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">QUICK CONVERSION</p>
                  <h2>Convert a currency</h2>
                </div>
                <button
                  type="button"
                  className="heading-icon swap-currencies-button"
                  onClick={swapCurrencies}
                  aria-label={`Swap ${base} and ${target}`}
                  title={`Swap ${base} and ${target}`}
                >
                  <span aria-hidden="true">⇄</span>
                </button>
              </div>

              <div className="field-label-row">
                <label className="field-label" htmlFor="base-currency">
                  YOU HAVE
                </label>
                <span className="field-hint">Base currency</span>
              </div>
              <div className="converter-field">
                <input
                  id="amount"
                  className="amount-input"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  aria-label="Amount to convert"
                />
                <select
                  id="base-currency"
                  className="currency-select"
                  value={base}
                  onChange={(event) => setBase(event.target.value)}
                  aria-label="Base currency"
                >
                  {CURRENCIES.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.flag} {currency.code}
                    </option>
                  ))}
                </select>
              </div>

              <div className="swap-divider">
                <span>↓</span>
              </div>

              <div className="field-label-row">
                <label className="field-label" htmlFor="target-currency">
                  YOU GET
                </label>
                <span className="field-hint">Converted amount</span>
              </div>
              <div className="conversion-result">
                <div className="conversion-result-value">
                  {data && Number.isFinite(converted) ? formatMoney(converted, target) : "—"}
                </div>
                <select
                  id="target-currency"
                  className="currency-select result-select"
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  aria-label="Target currency"
                >
                  {CURRENCIES.filter((currency) => currency.code !== base).map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.flag} {currency.code}
                    </option>
                  ))}
                </select>
              </div>
              <p className="converter-footnote">
                {data
                  ? `Based on 1 ${base} = ${formatRate(data.rates[target] ?? NaN)} ${target}`
                  : "Waiting for the latest available rate…"}
              </p>
            </div>

            <div className="panel freshness-panel">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">DATA TRANSPARENCY</p>
                  <h2>Rate health</h2>
                </div>
                <span className="heading-icon health-icon">⌁</span>
              </div>

              {loading && !data ? (
                <div className="health-loading">
                  <span className="loading loading-spinner loading-md" /> Fetching public rates…
                </div>
              ) : data ? (
                <>
                  <div className="health-status-row">
                    <FreshnessBadge data={data} />
                    <span className="source-tag">
                      {data.source === "fallback" ? "BACKUP SOURCE" : "PRIMARY SOURCE"}
                    </span>
                  </div>
                  <div className="rate-date-block">
                    <p className="health-label">LATEST RATE DATE</p>
                    <p className="rate-date">{formatDate(data.rateDate)}</p>
                    <p className="health-subline">Fetched {formatDateTime(data.fetchedAt)}</p>
                    {data.oldestRateDate && data.oldestRateDate !== data.rateDate && (
                      <p className="health-subline">
                        Some pairs are older, oldest rate: {formatDate(data.oldestRateDate)}
                      </p>
                    )}
                  </div>
                  <div className="health-divider" />
                  <div className="health-meta-row">
                    <span>Data provider</span>
                    <a href={data.providerUrl} target="_blank" rel="noreferrer">
                      {data.provider} ↗
                    </a>
                  </div>
                  <div className="health-meta-row">
                    <span>Cache status</span>
                    <strong>
                      {data.cacheStatus === "hit"
                        ? "Served from cache"
                        : data.cacheStatus === "stale"
                          ? "Last-known snapshot"
                          : data.cacheStatus === "fallback"
                            ? "Fallback fetch"
                            : "Fresh fetch"}
                    </strong>
                  </div>
                  {data.attribution && (
                    <p className="attribution">
                      Rates by{" "}
                      <a href={data.attribution.url} target="_blank" rel="noreferrer">
                        fawazahmed0 Currency API
                      </a>
                    </p>
                  )}
                </>
              ) : (
                <div className="empty-health">
                  <span className="empty-health-icon">⌁</span>
                  <p>Rate data is not available yet.</p>
                  <span>Try again when the provider responds.</span>
                </div>
              )}
            </div>
          </section>

          {error && (
            <div className="notice notice-error" role="alert">
              <span className="notice-icon">!</span>
              <div>
                <strong>We couldn't fetch exchange rates.</strong>
                <p>{error}</p>
              </div>
              <button
                className="text-button"
                onClick={() => loadRates({ isRefresh: Boolean(data) })}
                disabled={loading || refreshing}
              >
                Retry ↗
              </button>
            </div>
          )}

          {isWarning && (
            <div
              className={`notice ${data.isLastKnown || data.freshness.status === "stale" ? "notice-error" : "notice-warning"}`}
              role="status"
            >
              <span className="notice-icon">!</span>
              <div>
                <strong>
                  {data.isLastKnown ? "Showing the last successful snapshot" : data.freshness.label}
                </strong>
                <p>
                  {data.warning || data.freshness.message}{" "}
                  {data.oldestRateDate && data.oldestRateDate !== data.rateDate
                    ? `The oldest requested quote is dated ${formatDate(data.oldestRateDate)}.`
                    : `The rates are dated ${formatDate(data.rateDate)}.`}
                </p>
              </div>
            </div>
          )}

          <section className="rates-section">
            <div className="rates-heading-row">
              <div>
                <p className="section-kicker">THE MARKET SNAPSHOT</p>
                <h2>Popular exchange rates</h2>
                <p className="rates-subtitle">
                  One {base} converted into commonly used currencies. Each card shows its own rate
                  date.
                </p>
              </div>
              <div className="rates-controls">
                <label className="base-picker-label" htmlFor="rates-base">
                  BASE
                </label>
                <select
                  id="rates-base"
                  className="base-picker"
                  value={base}
                  onChange={(event) => setBase(event.target.value)}
                >
                  {CURRENCIES.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.code}
                    </option>
                  ))}
                </select>
                <button
                  className="refresh-button"
                  onClick={() => loadRates({ isRefresh: Boolean(data) })}
                  disabled={loading || refreshing}
                >
                  <span className={refreshing ? "refresh-icon spinning" : "refresh-icon"}>↻</span>
                  {refreshing ? "Checking" : "Check for updates"}
                </button>
              </div>
            </div>

            {loading && !data ? (
              <div className="rates-loading">
                <span className="loading loading-spinner loading-lg" />
                <span>Connecting to public rate providers…</span>
              </div>
            ) : data ? (
              <>
                <div className="rates-grid">
                  {availableRates.map(({ code, rate }) => (
                    <RateCard
                      key={code}
                      currency={code}
                      rate={rate}
                      base={base}
                      rateDate={data.rateDates?.[code] || data.rateDate}
                    />
                  ))}
                </div>
                {availableRates.length === 0 && (
                  <div className="empty-rates">
                    No popular quote currencies were returned for {base}. Try another base currency.
                  </div>
                )}
                <div className="rates-footnote">
                  <span className="footnote-mark">i</span>
                  <span>
                    Reference rates for {formatDate(data.rateDate)}. Values may differ from the rate
                    offered by your bank or card provider.
                  </span>
                  <span className="footnote-updated">Checked {formatDateTime(lastChecked)}</span>
                </div>
              </>
            ) : (
              <div className="rates-error-state">
                <div className="rates-error-icon">↻</div>
                <h3>Rates are taking a break.</h3>
                <p>
                  Neither public provider returned usable data. No values are being made up or
                  silently substituted.
                </p>
                <button
                  className="refresh-button primary-refresh"
                  onClick={() => loadRates()}
                  disabled={loading}
                >
                  Try again
                </button>
              </div>
            )}
          </section>

          <footer className="footer">
            <p>
              <span className="footer-brand">clearfx</span> Built around one simple idea: reliable
              data should come with an honest timestamp.
            </p>
            <span>DAILY REFERENCE RATES · NOT LIVE TRADING DATA</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

export default App;
