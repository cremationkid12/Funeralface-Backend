import express from "express";
import type { Express, Request, Response } from "express";

export function createApp(): Express {
  const app = express();

  app.get("/v1/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
  });

  return app;
}
