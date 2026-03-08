import { Router } from "express";
import {
  LandmarkSampleSchema,
  MatchResultRequestSchema
} from "@blink/shared";

import { RefereeEngine } from "../services/referee-engine.js";

export const createInternalRouter = (engine: RefereeEngine) => {
  const router = Router();

  router.post("/matches/:id/result", async (req, res) => {
    try {
      const result = await engine.resolve(req.params.id, MatchResultRequestSchema.parse(req.body));
      res.json({ match: result });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  router.post("/matches/:id/landmarks", async (req, res) => {
    try {
      const result = await engine.ingestLandmarkSample(req.params.id, LandmarkSampleSchema.parse(req.body));
      res.json({ match: result });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  return router;
};

