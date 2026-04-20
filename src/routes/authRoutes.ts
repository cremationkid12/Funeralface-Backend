import { Router } from "express";
import type { Request, Response } from "express";
import { requireAuth } from "../auth/authMiddleware";
import type { AppServices } from "../appServices";
import {
  getAuthMe,
  postEnsureProvisioned,
  postGoogleLogin,
  postLogin,
  postLogout,
  postPasswordRecover,
  postRefresh,
  postRegister,
  type AuthControllerDeps,
} from "../controllers/authController";

export function createAuthRouter(services: AppServices): Router {
  const router = Router();
  const authDeps: AuthControllerDeps = {
    authService: services.authService,
    staffService: services.staffService,
  };

  router.get("/me", requireAuth, getAuthMe);

  router.post("/ensure-provisioned", (req: Request, res: Response) =>
    postEnsureProvisioned(req, res, services.staffService),
  );

  router.post("/register", (req: Request, res: Response) => postRegister(req, res, authDeps));
  router.post("/login", (req: Request, res: Response) => postLogin(req, res, authDeps));
  router.post("/login/google", (req: Request, res: Response) => postGoogleLogin(req, res, authDeps));
  router.post("/refresh", (req: Request, res: Response) =>
    postRefresh(req, res, services.authService),
  );
  router.post("/logout", (req: Request, res: Response) => postLogout(req, res, services.authService));
  router.post("/password/recover", (req: Request, res: Response) =>
    postPasswordRecover(req, res, services.authService),
  );

  return router;
}
