import test from "node:test";
import assert from "node:assert/strict";
import {
  createRatesService,
  InvalidRatesRequestError,
  RatesUnavailableError,
} from "../src/services/ratesService.js";

const silentLogger = { warn() {} };

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; },
  };
}

const primaryPayload = [
  { date: "2026-10-30", base: "USD", quote: "EUR", rate: 0.86 },
  { date: "2026-10-30", base: "USD", quote: "INR", rate: 88.1 },
  { date: "2026-10-30", base: "USD", quote: "GBP", rate: 0.75 },
];

const fallbackPayload = {
  date: "2026-10-31",
  usd: { usd: 1, inr: 88.2, eur: 0.861 },
};

test("uses Frankfurter first and returns requested symbols", async () => {
  const service = createRatesService({
    fetchImpl: async () => jsonResponse(primaryPayload),
    now: () => new Date("2026-11-01T10:00:00.000Z"),
    logger: silentLogger,
  });

  const result = await service.getLatestRates({ base: "usd", symbols: "INR,EUR" });
  assert.equal(result.provider, "Frankfurter");
  assert.equal(result.source, "primary");
  assert.deepEqual(result.rates, { USD: 1, INR: 88.1, EUR: 0.86 });
  assert.equal(result.rateDate, "2026-10-30");
  assert.equal(result.isLastKnown, false);
});

test("falls back to the open currency dataset when Frankfurter fails", async () => {
  const requestedUrls = [];
  const service = createRatesService({
    fetchImpl: async (url) => {
      requestedUrls.push(String(url));
      if (String(url).includes("frankfurter")) throw new Error("Primary provider offline");
      return jsonResponse(fallbackPayload);
    },
    now: () => new Date("2026-11-01T10:00:00.000Z"),
    logger: silentLogger,
  });

  const result = await service.getLatestRates({ base: "USD", symbols: "INR,EUR" });
  assert.equal(requestedUrls.length, 2);
  assert.equal(result.source, "fallback");
  assert.equal(result.provider, "fawazahmed0 Currency API");
  assert.deepEqual(result.rates, { USD: 1, INR: 88.2, EUR: 0.861 });
  assert.match(result.attribution?.url ?? "", /github\.com\/fawazahmed0/);
});

test("serves last-known-good rates when both providers fail", async () => {
  let currentTime = new Date("2026-11-01T10:00:00.000Z");
  let shouldFail = false;
  const service = createRatesService({
    fetchImpl: async (url) => {
      if (shouldFail) throw new Error("Provider offline");
      if (String(url).includes("frankfurter")) return jsonResponse(primaryPayload);
      return jsonResponse(fallbackPayload);
    },
    now: () => currentTime,
    logger: silentLogger,
  });

  const first = await service.getLatestRates({ base: "USD" });
  assert.equal(first.isLastKnown, false);

  shouldFail = true;
  currentTime = new Date("2026-11-01T10:20:00.000Z");
  const stale = await service.getLatestRates({ base: "USD" });

  assert.equal(stale.isLastKnown, true);
  assert.equal(stale.cacheStatus, "stale");
  assert.deepEqual(stale.rates, first.rates);
  assert.match(stale.warning, /Both public providers failed/);
});

test("uses the documented Cloudflare mirror if jsDelivr is unavailable", async () => {
  const requestedUrls = [];
  const service = createRatesService({
    fetchImpl: async (url) => {
      requestedUrls.push(String(url));
      if (String(url).includes("frankfurter")) throw new Error("Primary provider unavailable");
      if (String(url).includes("cdn.jsdelivr.net")) return jsonResponse({ unexpected: true });
      return jsonResponse(fallbackPayload);
    },
    now: () => new Date("2026-11-01T10:00:00.000Z"),
    logger: silentLogger,
  });

  const result = await service.getLatestRates({ base: "USD", symbols: "INR" });
  assert.equal(requestedUrls.length, 3);
  assert.match(requestedUrls[2], /currency-api\.pages\.dev/);
  assert.equal(result.source, "fallback");
  assert.equal(result.rates.INR, 88.2);
});

test("reports the oldest date among the requested quote currencies", async () => {
  const mixedDatePayload = [
    { date: "2026-10-31", base: "USD", quote: "EUR", rate: 0.86 },
    { date: "2026-10-27", base: "USD", quote: "INR", rate: 88.1 },
  ];
  const service = createRatesService({
    fetchImpl: async () => jsonResponse(mixedDatePayload),
    now: () => new Date("2026-11-01T10:00:00.000Z"),
    logger: silentLogger,
  });

  const result = await service.getLatestRates({ base: "USD", symbols: "EUR,INR" });
  assert.equal(result.rateDate, "2026-10-31");
  assert.equal(result.oldestRateDate, "2026-10-27");
  assert.equal(result.rateDates.INR, "2026-10-27");
  assert.equal(result.freshness.ageDays, 5);
  assert.equal(result.freshness.status, "delayed");
});

test("serves a cached snapshot without another upstream request", async () => {
  let requestCount = 0;
  const service = createRatesService({
    fetchImpl: async () => {
      requestCount += 1;
      return jsonResponse(primaryPayload);
    },
    now: () => new Date("2026-11-01T10:00:00.000Z"),
    logger: silentLogger,
  });

  await service.getLatestRates({ base: "USD" });
  const cached = await service.getLatestRates({ base: "USD" });

  assert.equal(requestCount, 1);
  assert.equal(cached.cacheStatus, "hit");
});

test("returns a recoverable unavailable error when no provider has ever succeeded", async () => {
  const service = createRatesService({
    fetchImpl: async () => { throw new Error("Offline"); },
    logger: silentLogger,
  });

  await assert.rejects(
    service.getLatestRates({ base: "USD" }),
    RatesUnavailableError,
  );
});

test("rejects malformed currency input", async () => {
  const service = createRatesService({
    fetchImpl: async () => jsonResponse(primaryPayload),
    logger: silentLogger,
  });

  await assert.rejects(
    service.getLatestRates({ base: "US" }),
    InvalidRatesRequestError,
  );
});
