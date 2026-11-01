# MY_APPROACH.md

## 1. What is the actual user problem?

The product has 10,000 free users and 200 paid users, but only 2% convert to paid, against a 5% industry benchmark. Around 40 support tickets arrive each week because rates are wrong or unavailable. The core problem is lost trust: free users see stale rates or errors and hesitate to rely on the product.

## 2. What would be my product approach?

I'd focus on three things:

1. Availability: If one API goes down, users shouldn't immediately see an error.
2. Freshness: Users should know when the data was actually updated instead of assuming it's current.
3. Transparency: If we're showing cached or older data, we should tell users rather than pretending everything is working perfectly.

I believe showing slightly older data with an honest timestamp is better than showing nothing or misleading users into thinking they're looking at live rates.

## 3. What should a free-tier user be able to trust?

They should see rates from a real, identified source, know when those rates were published, and be told when data is cached or stale. Daily reference rates are not live trading quotes. The free tier should be reliable and transparent without pretending to offer the $9/month paid tier's real-time rates and historical data.

## 4. What is the smallest useful solution I can ship today?

One backend endpoint that fetches rates from a primary public API (Frankfurter API), falls back to another provider (fawazahmed0 Currency API), and caches successful results. A small React UI should display rates, support currency conversion, and show the source and freshness. I'd deploy both parts and leave accounts, payments, and historical charts out of scope.

## 5. What should happen when a provider is slow, unavailable, or returns old data?

Set a timeout and try the fallback if the primary provider fails or returns invalid data. If both providers fail, serve the last successful cached rates and clearly mark them as stale with their original publication date. If no cached data exists, show a clear error and let the user retry. Never present old data as fresh.

## 6. How I'd approach the $5/day budget?

I wouldn't immediately spend the entire $5/day on premium API calls.
I'd initially focus on improving the free-tier experience using public APIs and caching.
With more time, I'd consider using premium calls selectively for situations where they could make the biggest difference.
For example, a user repeatedly checking a currency conversion before making an important transaction might justify a premium refresh.
However, I'd want usage data before implementing this. Spending the budget without understanding where it provides value would defeat the purpose.

## 7. What am I deliberately not building today, and why?

I'm not building authentication, payment flows, premium API integration, historical charts, or advanced analytics. They don't solve the immediate reliability problem and would put the core service at risk under the time limit. The optional budget is up to $5/day. I would not spend it broadly before proving that a premium source provides meaningfully fresher data. If tested later, those calls should be reserved for critical moments. First, I'd prove the public-source service works reliably and measure whether support tickets fall and conversion moves from the 2% baseline toward the 5% benchmark.

## Final thoughts

My biggest takeaway from this problem is that adding more APIs doesn't automatically make a product more reliable. The real value comes from knowing how to handle those APIs when they don't behave as expected.
For this project, I'd rather ship a smaller application that consistently gives users useful information, explains its limitations, and handles failures gracefully than a feature-rich application that breaks whenever an external service goes down.
