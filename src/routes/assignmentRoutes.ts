import { Router } from "express";
import type { Request, Response } from "express";
import { requireAuth, type AuthenticatedRequest } from "../auth/authMiddleware";
import { requireActiveSubscription, requireAdminWrite } from "../auth/writeAccessMiddleware";
import type { AppServices } from "../appServices";
import {
  getAssignments,
  patchAssignment,
  postAssignment,
  postShareFamilyLinkByEmail,
} from "../controllers/assignmentController";

export function createAssignmentRouter(services: AppServices): Router {
  const router = Router();
  const requireWrite = [
    requireAuth,
    requireAdminWrite,
    requireActiveSubscription(services.billingService),
  ] as const;

  router.get("/", requireAuth, (req: Request, res: Response) =>
    getAssignments(req as AuthenticatedRequest, res, services.assignmentService),
  );

  router.post("/", ...requireWrite, (req: Request, res: Response) =>
    postAssignment(req as AuthenticatedRequest, res, services.assignmentService),
  );

  router.patch("/:id", ...requireWrite, (req: Request, res: Response) =>
    patchAssignment(req as AuthenticatedRequest, res, services.assignmentService),
  );

  router.post("/:id/share/email", ...requireWrite, (req: Request, res: Response) =>
    postShareFamilyLinkByEmail(
      req as AuthenticatedRequest,
      res,
      services.assignmentService,
    ),
  );

  return router;
}
