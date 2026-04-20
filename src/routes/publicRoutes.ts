import { Router } from "express";
import type { Request, Response } from "express";
import type { AppServices } from "../appServices";
import { getAssignmentByPublicToken } from "../controllers/publicAssignmentController";

export function createPublicRouter(services: AppServices): Router {
  const router = Router();

  router.get("/assignments/by-token/:token", services.publicTokenRateLimit, (req: Request, res: Response) =>
    getAssignmentByPublicToken(req, res, services.familyTokenService),
  );

  return router;
}
