# MY_APPROACH.md

## 1. What is the actual user problem?

The product has 10,000 free users and 200 paid users, but only 2% convert to paid, against a 5% industry benchmark. Around 40 support tickets arrive each week because rates are wrong or unavailable. The core problem is lost trust: free users see stale rates or errors and hesitate to rely on the product.

## 2. What should a free-tier user be able to trust?

They should see rates from a real, identified source, know when those rates were published, and be told when data is cached or stale. Daily reference rates are not live trading quotes. The free tier should be reliable and transparent without pretending to offer the $9/month paid tier's real-time rates and historical data.

## 3. What is the smallest useful solution I can ship today?

One backend endpoint that fetches rates from a primary public API, falls back to another provider, and caches successful results. A small React UI should display rates, support currency conversion, and show the source and freshness. I'd deploy both parts and leave accounts, payments, and historical charts out of scope.

## 4. What should happen when a provider is slow, unavailable, or returns old data?

Set a timeout and try the fallback if the primary provider fails or returns invalid data. If both providers fail, serve the last successful cached rates and clearly mark them as stale with their original publication date. If no cached data exists, show a clear error and let the user retry. Never present old data as fresh.

## 5. What am I deliberately not building today, and why?

I'm not building authentication, payment flows, premium API integration, historical charts, or advanced analytics. They don't solve the immediate reliability problem and would put the core service at risk under the time limit. The optional budget is up to $5/day. I would not spend it broadly before proving that a premium source provides meaningfully fresher data. If tested later, those calls should be reserved for critical moments. First, I'd prove the public-source service works reliably and measure whether support tickets fall and conversion moves from the 2% baseline toward the 5% benchmark.
