import { Router } from "express";
import type { Request, Response } from "express";
import { requireAuth, type AuthenticatedRequest } from "../auth/authMiddleware";
import type { AppServices } from "../appServices";
import { getSettings, patchSettings } from "../controllers/settingsController";

export function createSettingsRouter(services: AppServices): Router {
  const router = Router();

  router.get("/", requireAuth, (req: Request, res: Response) =>
    getSettings(req as AuthenticatedRequest, res, services.settingsService),
  );
  router.patch("/", requireAuth, (req: Request, res: Response) =>
    patchSettings(req as AuthenticatedRequest, res, services.settingsService),
  );

  return router;
}
