import type { NextFunction, Response } from "express";
import type { BillingService } from "../services/billingService";
import { SubscriptionRequiredError } from "../services/billingService";
import type { AuthenticatedRequest } from "./authMiddleware";

function respondSubscriptionRequired(res: Response, error: SubscriptionRequiredError): void {
  res.status(403).json({
    code: error.code,
    message: error.message,
  });
}

function respondForbidden(res: Response, message: string): void {
  res.status(403).json({
    code: "forbidden",
    message,
  });
}

/** Org must have trialing or active subscription (all staff, including invited users). */
export function requireActiveSubscription(billingService: BillingService) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const orgId = req.auth?.orgId;
    if (!orgId) {
      res.status(401).json({
        code: "unauthorized",
        message: "Authentication is required.",
      });
      return;
    }

    try {
      await billingService.assertOrgHasActiveSubscription(orgId);
      next();
    } catch (error) {
      if (error instanceof SubscriptionRequiredError) {
        respondSubscriptionRequired(res, error);
        return;
      }
      next(error);
    }
  };
}

/** Admin-only write (role check). Use after requireAuth. */
export function requireAdminWrite(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({
      code: "unauthorized",
      message: "Authentication is required.",
    });
    return;
  }

  if (req.auth.role !== "admin") {
    respondForbidden(
      res,
      "You do not have permission to perform this action. Contact your funeral home admin.",
    );
    return;
  }

  next();
}
