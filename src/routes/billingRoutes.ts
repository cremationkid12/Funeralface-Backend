import { Router } from "express";
import type { Request, Response } from "express";
import { requireAuth, type AuthenticatedRequest } from "../auth/authMiddleware";
import { requireRole } from "../auth/requireRole";
import type { AppServices } from "../appServices";
import {
  getSubscription,
  postCheckoutSession,
  postPortalSession,
} from "../controllers/billingController";

export function createBillingRouter(services: AppServices): Router {
  const router = Router();

  router.get("/subscription", requireAuth, (req: Request, res: Response) =>
    getSubscription(req as AuthenticatedRequest, res, services.billingService),
  );

  router.post(
    "/checkout-session",
    requireAuth,
    requireRole("admin"),
    (req: Request, res: Response) =>
      postCheckoutSession(req as AuthenticatedRequest, res, services.billingService),
  );

  router.post(
    "/portal-session",
    requireAuth,
    requireRole("admin"),
    (req: Request, res: Response) =>
      postPortalSession(req as AuthenticatedRequest, res, services.billingService),
  );

  return router;
}
