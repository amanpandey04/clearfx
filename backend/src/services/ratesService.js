const FRANKFURTER_URL = "https://api.frankfurter.dev/v2/rates";
const FALLBACK_CDN_URL = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies";
const FALLBACK_MIRROR_URL = "https://latest.currency-api.pages.dev/v1/currencies";

const PRIMARY_CACHE_TTL_MS = 15 * 60 * 1000;
const FALLBACK_CACHE_TTL_MS = 60 * 60 * 1000;
const STALE_RETRY_TTL_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 6000;
const MAX_SYMBOLS = 25;
const DAY_MS = 24 * 60 * 60 * 1000;

export class RatesUnavailableError extends Error {
  constructor(message = "Exchange-rate providers are temporarily unavailable.") {
    super(message);
    this.name = "RatesUnavailableError";
    this.statusCode = 503;
  }
}

export class InvalidRatesRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidRatesRequestError";
    this.statusCode = 400;
  }
}

function validateCurrencyCode(value, fieldName) {
  const code = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new InvalidRatesRequestError(`${fieldName} must be a three-letter currency code.`);
  }
  return code;
}

function parseSymbols(value) {
  if (value === undefined || value === null || value === "") return null;

  const rawSymbols = Array.isArray(value) ? value : String(value).split(",");
  const symbols = [...new Set(rawSymbols.map((item) => validateCurrencyCode(item, "symbols")))];

  if (symbols.length > MAX_SYMBOLS) {
    throw new InvalidRatesRequestError(`A maximum of ${MAX_SYMBOLS} quote currencies is allowed.`);
  }

  return symbols;
}

function getAgeInDays(rateDate, providerUpdatedAt, now) {
  const publishedTime = providerUpdatedAt ? Date.parse(providerUpdatedAt) : NaN;
  const rateTime = Number.isFinite(publishedTime)
    ? publishedTime
    : Date.parse(`${rateDate}T00:00:00.000Z`);

  if (!Number.isFinite(rateTime)) return null;
  return Math.max(0, Math.floor((now.getTime() - rateTime) / DAY_MS));
}

function getFreshness(rateDate, providerUpdatedAt, now, isLastKnown) {
  const ageDays = getAgeInDays(rateDate, providerUpdatedAt, now);

  if (isLastKnown) {
    return {
      status: "stale",
      ageDays,
      label: "Last-known data",
      message: "Both public providers are unavailable. This is the last successful rate snapshot.",
    };
  }

  // Daily reference rates are not expected to publish on weekends or every market holiday.
  // A four-day allowance avoids incorrectly warning on an ordinary long weekend.
  if (ageDays === null || ageDays <= 4) {
    return {
      status: "fresh",
      ageDays,
      label: "Within normal update window",
      message: "These are daily reference rates, not live market quotes.",
    };
  }

  if (ageDays <= 7) {
    return {
      status: "delayed",
      ageDays,
      label: "Publication is delayed",
      message: "The rate date is older than expected. Check the date before relying on this value.",
    };
  }

  return {
    status: "stale",
    ageDays,
    label: "Rate data is old",
    message: "The provider's latest available rate date is unusually old.",
  };
}

function buildRateMap(rows, base) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Frankfurter returned an empty or invalid rates payload.");
  }

  const rates = { [base]: 1 };
  const rateDates = {};

  for (const row of rows) {
    const quote = String(row?.quote ?? "").toUpperCase();
    const rate = Number(row?.rate);
    const rowBase = String(row?.base ?? "").toUpperCase();
    const rowDate = row?.date;
    const validDate = typeof rowDate === "string"
      && /^\d{4}-\d{2}-\d{2}$/.test(rowDate)
      && Number.isFinite(Date.parse(`${rowDate}T00:00:00.000Z`));

    if (rowBase !== base || !/^[A-Z]{3}$/.test(quote)
      || !Number.isFinite(rate) || rate <= 0 || !validDate) {
      continue;
    }

    rates[quote] = rate;
    rateDates[quote] = rowDate;
  }

  const dates = Object.values(rateDates).sort();
  if (dates.length === 0) {
    throw new Error("Frankfurter returned no usable rates for the requested base currency.");
  }

  return {
    rates,
    rateDates,
    rateDate: dates.at(-1),
    oldestRateDate: dates[0],
  };
}
function normalizeCurrencyApi(payload, base) {
  const baseKey = base.toLowerCase();
  const inputRates = payload?.[baseKey];
  const rateDate = typeof payload?.date === "string" ? payload.date : null;

  if (!inputRates || typeof inputRates !== "object" || Array.isArray(inputRates)) {
    throw new Error("Currency API returned no rates map for the requested base currency.");
  }
  if (!rateDate || !/^\d{4}-\d{2}-\d{2}$/.test(rateDate)
    || !Number.isFinite(Date.parse(`${rateDate}T00:00:00.000Z`))) {
    throw new Error("Currency API did not provide a valid rate date.");
  }

  const rates = { [base]: 1 };
  for (const [rawQuote, rawRate] of Object.entries(inputRates)) {
    const quote = rawQuote.toUpperCase();
    const rate = Number(rawRate);
    if (/^[A-Z]{3}$/.test(quote) && Number.isFinite(rate) && rate > 0) {
      rates[quote] = rate;
    }
  }

  if (Object.keys(rates).length < 2) {
    throw new Error("Currency API returned no usable rates.");
  }

  const rateDates = Object.fromEntries(
    Object.keys(rates).filter((quote) => quote !== base).map((quote) => [quote, rateDate]),
  );

  return { rates, rateDates, rateDate, oldestRateDate: rateDate, providerUpdatedAt: null };
}

function makeAbortSignal(timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clearTimeout: () => clearTimeout(timeout) };
}

async function requestJson(fetchImpl, url) {
  const timeout = makeAbortSignal(REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: timeout.signal,
    });

    if (!response || !response.ok) {
      throw new Error(`Provider responded with HTTP ${response?.status ?? "unknown"}.`);
    }

    return await response.json();
  } finally {
    timeout.clearTimeout();
  }
}

export function createRatesService({
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  logger = console,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch implementation is required.");
  }

  const cache = new Map();
  const lastKnownGood = new Map();
  const inFlight = new Map();

  async function fetchPrimary(base) {
    const url = new URL(FRANKFURTER_URL);
    url.searchParams.set("base", base);
    const payload = await requestJson(fetchImpl, url.toString());
    const normalized = buildRateMap(payload, base);
    const fetchedAt = now().toISOString();

    return {
      base,
      rates: normalized.rates,
      rateDates: normalized.rateDates,
      rateDate: normalized.rateDate,
      oldestRateDate: normalized.oldestRateDate,
      provider: "Frankfurter",
      providerUrl: "https://frankfurter.dev/",
      source: "primary",
      providerUpdatedAt: null,
      fetchedAt,
      attribution: null,
    };
  }

  async function fetchFallback(base) {
    const currency = base.toLowerCase();
    const urls = [
      `${FALLBACK_CDN_URL}/${currency}.json`,
      `${FALLBACK_MIRROR_URL}/${currency}.json`,
    ];
    let lastError;

    for (const url of urls) {
      try {
        const payload = await requestJson(fetchImpl, url);
        const normalized = normalizeCurrencyApi(payload, base);
        const fetchedAt = now().toISOString();

        return {
          base,
          rates: normalized.rates,
          rateDates: normalized.rateDates,
          rateDate: normalized.rateDate,
          oldestRateDate: normalized.oldestRateDate,
          provider: "fawazahmed0 Currency API",
          providerUrl: "https://github.com/fawazahmed0/exchange-api",
          source: "fallback",
          providerUpdatedAt: null,
          fetchedAt,
          attribution: {
            label: "Currency data by fawazahmed0",
            url: "https://github.com/fawazahmed0/exchange-api",
          },
        };
      } catch (error) {
        lastError = error;
        logger.warn?.(`[rates] Currency API mirror failed for ${base}: ${error.message}`);
      }
    }

    throw lastError ?? new Error("Both Currency API mirrors failed.");
  }

  async function refresh(base) {
    let primaryError;

    try {
      const data = await fetchPrimary(base);
      const entry = {
        data,
        expiresAt: now().getTime() + PRIMARY_CACHE_TTL_MS,
      };
      cache.set(base, entry);
      lastKnownGood.set(base, data);
      return { ...data, isLastKnown: false, cacheStatus: "miss" };
    } catch (error) {
      primaryError = error;
      logger.warn?.(`[rates] Frankfurter failed for ${base}: ${error.message}`);
    }

    try {
      const data = await fetchFallback(base);
      const entry = {
        data,
        expiresAt: now().getTime() + FALLBACK_CACHE_TTL_MS,
      };
      cache.set(base, entry);
      lastKnownGood.set(base, data);
      return { ...data, isLastKnown: false, cacheStatus: "fallback" };
    } catch (fallbackError) {
      logger.warn?.(`[rates] Currency API fallback failed for ${base}: ${fallbackError.message}`);

      const previous = lastKnownGood.get(base);
      if (previous) {
        const staleEntry = {
          ...previous,
          isLastKnown: true,
          cacheStatus: "stale",
          warning: "Both public providers failed. Showing the last successful rates; check the rate date before using them.",
          providerErrors: {
            primary: primaryError?.message ?? "Primary provider failed.",
            fallback: fallbackError?.message ?? "Fallback provider failed.",
          },
        };
        cache.set(base, {
          data: staleEntry,
          expiresAt: now().getTime() + STALE_RETRY_TTL_MS,
        });
        return staleEntry;
      }

      throw new RatesUnavailableError();
    }
  }

  async function getLatestRates({ base: rawBase = "USD", symbols: rawSymbols } = {}) {
    const base = validateCurrencyCode(rawBase, "base");
    const symbols = parseSymbols(rawSymbols);
    const currentTime = now();
    let result;

    const cached = cache.get(base);
    if (cached && cached.expiresAt > currentTime.getTime()) {
      result = {
        ...cached.data,
        isLastKnown: Boolean(cached.data.isLastKnown),
        cacheStatus: cached.data.isLastKnown ? "stale" : "hit",
      };
    } else {
      let pending = inFlight.get(base);
      if (!pending) {
        pending = refresh(base);
        inFlight.set(base, pending);
      }

      try {
        result = await pending;
      } finally {
        if (inFlight.get(base) === pending) inFlight.delete(base);
      }
    }

    const selectedRates = { [base]: 1 };
    if (symbols) {
      for (const symbol of symbols) {
        if (symbol === base) continue;
        if (Object.hasOwn(result.rates, symbol)) selectedRates[symbol] = result.rates[symbol];
      }
    } else {
      Object.assign(selectedRates, result.rates);
    }

    const selectedRateDates = symbols
      ? Object.fromEntries(symbols.filter((symbol) => result.rateDates?.[symbol]).map((symbol) => [symbol, result.rateDates[symbol]]))
      : result.rateDates;
    const selectedDateValues = Object.values(selectedRateDates).sort();
    const latestSelectedRateDate = selectedDateValues.at(-1) ?? result.rateDate;
    const oldestSelectedRateDate = selectedDateValues[0] ?? result.oldestRateDate ?? result.rateDate;
    const servedAt = now().toISOString();
    const freshness = getFreshness(
      oldestSelectedRateDate,
      result.providerUpdatedAt,
      new Date(servedAt),
      result.isLastKnown,
    );

    return {
      base,
      rates: selectedRates,
      rateDates: selectedRateDates,
      provider: result.provider,
      providerUrl: result.providerUrl,
      source: result.source,
      rateDate: latestSelectedRateDate,
      oldestRateDate: oldestSelectedRateDate,
      providerUpdatedAt: result.providerUpdatedAt,
      fetchedAt: result.fetchedAt,
      servedAt,
      cacheStatus: result.cacheStatus,
      isLastKnown: Boolean(result.isLastKnown),
      freshness,
      warning: result.warning ?? null,
      providerErrors: result.providerErrors ?? null,
      attribution: result.attribution,
      note: "Daily reference rates are not live market quotes.",
    };
  }

  return { getLatestRates };
}

export const ratesService = createRatesService();
