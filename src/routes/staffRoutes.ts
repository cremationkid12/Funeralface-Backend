import { Router } from "express";
import type { Request, Response } from "express";
import { requireAuth, type AuthenticatedRequest } from "../auth/authMiddleware";
import { requireRole } from "../auth/requireRole";
import type { AppServices } from "../appServices";
import {
  deleteStaff,
  getStaffList,
  patchStaff,
  postStaff,
  postStaffActivate,
  postStaffDeactivate,
  postStaffInvite,
} from "../controllers/staffController";

export function createStaffRouter(services: AppServices): Router {
  const router = Router();

  router.post(
    "/invite",
    requireAuth,
    requireRole("admin"),
    (req: Request, res: Response) =>
      postStaffInvite(req as AuthenticatedRequest, res, services.inviteUserByEmail),
  );

  router.get("/", requireAuth, requireRole("admin"), (req: Request, res: Response) =>
    getStaffList(req as AuthenticatedRequest, res, services.staffService),
  );

  router.post("/", requireAuth, requireRole("admin"), (req: Request, res: Response) =>
    postStaff(req as AuthenticatedRequest, res, services.staffService),
  );

  router.patch("/:id", requireAuth, requireRole("admin"), (req: Request, res: Response) =>
    patchStaff(req as AuthenticatedRequest, res, services.staffService),
  );

  router.delete("/:id", requireAuth, requireRole("admin"), (req: Request, res: Response) =>
    deleteStaff(req as AuthenticatedRequest, res, services.staffService),
  );

  router.post(
    "/:id/activate",
    requireAuth,
    requireRole("admin"),
    (req: Request, res: Response) =>
      postStaffActivate(req as AuthenticatedRequest, res, services.staffService),
  );

  router.post(
    "/:id/deactivate",
    requireAuth,
    requireRole("admin"),
    (req: Request, res: Response) =>
      postStaffDeactivate(req as AuthenticatedRequest, res, services.staffService),
  );

  return router;
}
