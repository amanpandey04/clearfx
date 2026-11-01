# ClearFX, Real-Time Data Aggregation Service

A small foreign-exchange rate service built for the Cactro Product Engineer assignment. It prioritizes dependable access, transparent freshness information, and predictable degraded states over pretending that free daily reference rates are live trading quotes.

## Initial thought process, complete before submission

The assignment asks for your initial product thinking in this README and specifically requires `MY_APPROACH.md` to be written by you without AI. I have left the personal-thinking sections as prompts rather than inventing first-person reasoning on your behalf. Complete `MY_APPROACH.md` yourself, then replace this paragraph with a short summary of your own initial approach.

## What is included

- **Backend:** Node.js + Express, with one public API endpoint: `GET /api/rates`.
- **Frontend:** React + JavaScript + Vite + Tailwind CSS + DaisyUI.
- **Primary provider:** Frankfurter API v2, a no-key public API for daily institutional reference rates.
- **Fallback provider:** fawazahmed0 Currency API, a daily CC0 dataset delivered through jsDelivr with a documented Cloudflare Pages mirror.
- **Resilience:** Per-base-currency cache, in-flight request de-duplication, provider fallback, validation, and last-known-good data when both providers fail.
- **Tests:** Node's built-in test runner for provider fallback and stale-data behavior.

## Requirements

- Node.js 20 or newer (Node 22 LTS recommended).
- npm 10 or newer.
- Internet access for the backend to call the public exchange-rate APIs.

## Run locally

Open **two terminals** from the project root.

### 1. Start the backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

The backend listens on `http://localhost:4000`.

Test the single endpoint in a browser or terminal:

```bash
curl "http://localhost:4000/api/rates?base=USD&symbols=INR,EUR,GBP,JPY,AUD,CAD,CHF,SGD"
```

### 2. Start the frontend

In a second terminal, from the project root:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

The Vite development server proxies `/api` requests to the backend on port 4000. You do not need to configure a separate API URL when running locally.

### 3. Run backend tests

From the project root:

```bash
cd backend
npm test
```

### 4. Create a production frontend build

From the project root:

```bash
cd frontend
npm run build
```

The output is in `frontend/dist`.

## API contract

### `GET /api/rates`

| Query | Required | Example | Meaning |
|---|---|---|---|
| `base` | No | `USD` | Three-letter base currency. Defaults to `USD`. |
| `symbols` | No | `INR,EUR,GBP` | Optional comma-separated quote currencies, maximum 25. |

A successful response includes:

- `base` and `rates`, the selected exchange-rate values.
- `provider`, `providerUrl`, and `source`, showing where the response came from.
- `rateDate` and `oldestRateDate`, the newest and oldest dates among the requested quote currencies.
- `rateDates`, the individual publication date for each quote currency.
- `fetchedAt` and `servedAt`, separating upstream fetch time from response time.
- `cacheStatus`, `isLastKnown`, and `freshness`, so clients can distinguish cached, delayed, and last-known data.
- `attribution`, populated when the open-source fallback dataset is used.

If no provider has data and there is no previous successful response in memory, the endpoint returns HTTP `503` with a stable JSON error shape. It does not crash the server.

## Provider behavior and important limitation

Frankfurter publishes daily reference rates, not streaming market quotes. Its API documentation says the latest working-day rates are updated daily. The fallback dataset is also published daily as static JSON and is released under CC0-1.0. Its project documents both a jsDelivr CDN and a Cloudflare Pages mirror. The app therefore displays a rate date and source, and never describes this free-tier feed as real-time.

The backend caches Frankfurter results for 15 minutes and fallback results for one hour. The fallback mirrors serve the same dataset, so they improve delivery resilience but are not counted as two independent rate providers. Cache and last-known-good data are held in process memory, so a server restart or a serverless cold start clears them.

## Deploy

The repository includes `render.yaml` for the backend and `netlify.toml` for the frontend. Deployment requires your own Render and Netlify accounts and a GitHub repository; this project is not deployed automatically by generating the ZIP.

### Backend on Render

1. Push this folder to a GitHub repository.
2. In Render, create a new Blueprint and select the repository.
3. Render reads `render.yaml` and creates the `clearfx-api` web service.
4. After it is live, copy its public URL, for example `https://clearfx-api.onrender.com`.

### Frontend on Netlify

1. Create a new Netlify site from the same GitHub repository.
2. Netlify reads `netlify.toml` for the build command and publish directory.
3. In **Site configuration → Environment variables**, add:
   - Key: `VITE_API_BASE_URL`
   - Value: your Render backend URL, without a trailing slash.
4. Trigger a new deploy.
5. Copy the Netlify site URL and set `CORS_ORIGINS` on Render to that exact origin, for example `https://your-site.netlify.app`.
6. Redeploy the backend after changing `CORS_ORIGINS`.

If you use a different frontend host, set its build output to `frontend/dist` and configure `VITE_API_BASE_URL` to the backend's public URL.

## Project structure

```text
clearfx-aggregation-service/
├── MY_APPROACH.md
├── decisions.md
├── README.md
├── render.yaml
├── netlify.toml
├── backend/
│   ├── src/
│   │   ├── app.js
│   │   ├── server.js
│   │   └── services/
│   │       └── ratesService.js
│   ├── test/
│   │   └── ratesService.test.js
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── src/
    │   ├── lib/
    │   │   └── api.js
    │   ├── App.jsx
    │   ├── index.css
    │   └── main.jsx
    ├── .env.example
    ├── index.html
    ├── package.json
    ├── postcss.config.js
    ├── tailwind.config.js
    └── vite.config.js
```
