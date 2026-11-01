import express from "express";
import cors from "cors";
import helmet from "helmet";
import {
  InvalidRatesRequestError,
  RatesUnavailableError,
  ratesService,
} from "./services/ratesService.js";

export function createApp(service = ratesService) {
  const app = express();
  const configuredOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: configuredOrigins.length ? configuredOrigins : true }));

  app.get("/api/rates", async (req, res, next) => {
    try {
      const data = await service.getLatestRates({
        base: req.query.base ?? "USD",
        symbols: req.query.symbols,
      });

      res.set("Cache-Control", "no-store");
      res.status(200).json(data);
    } catch (error) {
      if (error instanceof InvalidRatesRequestError) {
        return res.status(400).json({
          error: {
            code: "INVALID_REQUEST",
            message: error.message,
          },
        });
      }

      if (error instanceof RatesUnavailableError) {
        return res.status(503).json({
          error: {
            code: "RATES_UNAVAILABLE",
            message: "Exchange rates are temporarily unavailable. No previous rate snapshot exists for this currency yet.",
          },
          retryable: true,
        });
      }

      return next(error);
    }
  });

  app.use((req, res) => {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Use GET /api/rates to retrieve exchange rates.",
      },
    });
  });

  app.use((error, req, res, next) => {
    console.error("[api] Unhandled request error:", error);
    if (res.headersSent) return next(error);
    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong while preparing exchange rates.",
      },
    });
  });

  return app;
}
