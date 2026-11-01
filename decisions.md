# Product and engineering decisions

## 1. Which APIs did I choose and why?

**Primary: Frankfurter API v2** (`https://api.frankfurter.dev/v2/rates`). It requires no API key, has no monthly quota, covers a broad set of currencies, and blends rates from institutional providers. The v2 API is used deliberately: its response is an array of `{ date, base, quote, rate }` records, not the v1 `{ rates: {} }` shape.

**Fallback: fawazahmed0 Currency API** (`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/{base}.json`). It requires no API key, publishes daily static JSON, covers a broad set of currencies, and is released under CC0-1.0. The project documents a Cloudflare Pages mirror (`https://latest.currency-api.pages.dev/v1/currencies/{base}.json`), which is attempted if jsDelivr fails. The app provides a discreet courtesy attribution link when this data is used. The two URLs are mirrors of one dataset, not independent rate providers.

Both sources are public daily reference-rate sources. They are not suitable for presenting tick-by-tick trading prices. I chose honest timestamps and consistent availability over a misleading "live" label.

## 2. What's the fallback strategy when an API fails?

1. Serve a still-valid backend cache entry without contacting an upstream provider.
2. When the cache expires, try Frankfurter first.
3. If Frankfurter errors, times out, or returns an invalid payload, try the fawazahmed0 dataset on jsDelivr, then its documented Cloudflare Pages mirror.
4. If both providers fail, return the last-known-good response for that base currency with `isLastKnown: true`, a stale cache state, and an explicit warning.
5. If this process has never received a successful response for that base currency, return HTTP `503` with a stable JSON error. The server remains running.

The backend also coalesces simultaneous requests for the same base currency, preventing a burst of visitors from creating duplicate upstream calls.

## 3. How are conflicting data sources handled?

The service uses a strict provider priority: Frankfurter is authoritative for a successful refresh; fawazahmed0 is used only if Frankfurter cannot provide a valid response. Rates from different providers are never averaged or mixed into one response. Their methodologies and publication times can differ, and averaging them would create a number neither provider actually published. The response always names the provider and rate date so the user can see the provenance.

## 4. What does the user see when things fail or data is stale?

- **Normal cache hit:** the rate table remains available with the original provider and rate date.
- **Primary provider down, fallback works:** rates remain visible, the source changes to the open-source fallback dataset, and its source attribution is shown.
- **Both providers down, previous data exists:** the last-known rates remain visible, but the interface shows a prominent stale-data warning and the original rate date. It never silently presents the old values as current.
- **Both providers down, no previous data exists:** the UI shows a recoverable error and a retry action rather than fabricated or hard-coded rates.

The endpoint includes `freshness`, `cacheStatus`, `isLastKnown`, and source metadata so another client can make the same distinction.

## 5. Did I improve data staleness?

Yes, in the ways appropriate to the free-tier constraint:

- Two independent public sources reduce the chance of showing an outage error.
- A 15-minute Frankfurter cache avoids repeated requests while keeping the service responsive to new daily publications.
- A one-hour fallback cache avoids repeatedly fetching a daily static dataset.
- In-flight request de-duplication prevents concurrent cache misses for the same base currency from stampeding providers.
- Last-known-good data keeps the screen useful during a temporary dual outage, while clearly marking it as stale.

These decisions improve availability and perceived reliability. They cannot make a once-daily upstream feed update more frequently than its publisher does. The UI exposes the provider's rate date rather than implying otherwise.

## 6. What did I cut to ship today?

- No login, user accounts, billing, or paid-tier integration.
- No historical charts, alerts, watchlists, or portfolio tracking.
- No database or distributed cache. This version uses in-memory cache and is intentionally a single-instance MVP.
- No premium API calls for free users. The assignment says free users use public APIs, and the public sources are sufficient for a trustworthy daily-reference experience. Spending the optional $5/day would not fix the providers' publication cadence unless a materially fresher licensed feed were introduced.
- No attempt to build a trading terminal or quote every currency pair in the interface.

## 7. What would I add with more time?

1. A shared Redis cache and scheduled refresh so multiple backend instances share one last-known-good snapshot.
2. Provider health metrics, latency/error dashboards, and alerting before users report failures.
3. Historical-rate views and currency-pair search.
4. A freshness policy backed by provider publication calendars and explicit market-holiday handling.
5. A paid-tier adapter for a licensed premium feed, with strict separation between free/public and paid/premium data paths.
6. Product experiments measuring conversion, repeated visits, rate-page exits, and support tickets. The key success measure is whether reliable free-tier data moves conversion toward the 5% benchmark without increasing support contacts.

## 8. Other product thoughts

The user does not need to be convinced that a free reference rate is real-time. They need to understand what the number means, when it was published, and whether the service is currently healthy. Clear provenance and honest degraded states are part of the product, not just backend implementation details.
