import { Router } from "express";
import type { Request, Response } from "express";
import { requireAuth, type AuthenticatedRequest } from "../auth/authMiddleware";
import { requireRole } from "../auth/requireRole";
import { requireActiveSubscription, requireAdminWrite } from "../auth/writeAccessMiddleware";
import type { AppServices } from "../appServices";
import {
  deleteStaff,
  getMyStaffProfile,
  getStaffList,
  patchMyStaffProfile,
  patchStaff,
  postStaff,
  postStaffActivate,
  postStaffDeactivate,
  postStaffInvite,
} from "../controllers/staffController";

export function createStaffRouter(services: AppServices): Router {
  const router = Router();
  const requireAdminWriteAccess = [
    requireAuth,
    requireAdminWrite,
    requireActiveSubscription(services.billingService),
  ] as const;

  router.post(
    "/invite",
    ...requireAdminWriteAccess,
    (req: Request, res: Response) =>
      postStaffInvite(req as AuthenticatedRequest, res, services.inviteUserByEmail),
  );

  router.get("/me", requireAuth, (req: Request, res: Response) =>
    getMyStaffProfile(req as AuthenticatedRequest, res, services.staffService),
  );

  router.patch(
    "/me",
    requireAuth,
    requireActiveSubscription(services.billingService),
    (req: Request, res: Response) =>
      patchMyStaffProfile(req as AuthenticatedRequest, res, services.staffService),
  );

  router.get("/", requireAuth, requireRole("admin"), (req: Request, res: Response) =>
    getStaffList(req as AuthenticatedRequest, res, services.staffService),
  );

  router.post("/", ...requireAdminWriteAccess, (req: Request, res: Response) =>
    postStaff(req as AuthenticatedRequest, res, services.staffService),
  );

  router.patch("/:id", ...requireAdminWriteAccess, (req: Request, res: Response) =>
    patchStaff(req as AuthenticatedRequest, res, services.staffService),
  );

  router.delete("/:id", ...requireAdminWriteAccess, (req: Request, res: Response) =>
    deleteStaff(req as AuthenticatedRequest, res, services.staffService),
  );

  router.post(
    "/:id/activate",
    ...requireAdminWriteAccess,
    (req: Request, res: Response) =>
      postStaffActivate(req as AuthenticatedRequest, res, services.staffService),
  );

  router.post(
    "/:id/deactivate",
    ...requireAdminWriteAccess,
    (req: Request, res: Response) =>
      postStaffDeactivate(req as AuthenticatedRequest, res, services.staffService),
  );

  return router;
}
