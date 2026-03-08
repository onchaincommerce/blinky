import express from "express";
import cors from "cors";

import { config } from "./config.js";
import { createInternalRouter } from "./routes/internal.js";
import { createMatchesRouter } from "./routes/matches.js";
import { EarBlinkDetector } from "./services/blink-detector.js";
import { CdpRefereeService } from "./services/cdp-referee.js";
import { LiveKitService } from "./services/livekit.js";
import { MatchStore } from "./services/match-store.js";
import { RefereeEngine } from "./services/referee-engine.js";
import { WalletBalanceService } from "./services/wallet-balance-service.js";

export const createApp = () => {
  const app = express();
  const matches = new MatchStore();
  const detector = new EarBlinkDetector();
  const cdpReferee = new CdpRefereeService();
  const livekit = new LiveKitService();
  const refereeEngine = new RefereeEngine(matches, detector, cdpReferee);
  const walletBalanceService = new WalletBalanceService();

  const corsOptions = {
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      if (!origin) {
        callback(null, true);
        return;
      }

      callback(null, config.corsOrigins.includes(origin));
    },
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204
  };

  app.use(cors(corsOptions));
  app.options("*", cors(corsOptions));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      escrowConfigured: Boolean(config.ESCROW_CONTRACT_ADDRESS),
      livekitConfigured: Boolean(config.LIVEKIT_API_KEY && config.LIVEKIT_API_SECRET && config.LIVEKIT_WS_URL)
    });
  });

  app.get("/wallets/:address/balances", async (req, res) => {
    try {
      const payload = await walletBalanceService.getBalances(req.params.address);
      res.json(payload);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.use("/matches", createMatchesRouter(matches, livekit, cdpReferee));
  app.use("/internal", createInternalRouter(refereeEngine));

  return app;
};

export const app = createApp();
