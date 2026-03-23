import express from "express";
import type { Express, Request, Response } from "express";
import { requireAuth, type AuthenticatedRequest } from "./auth/authMiddleware";
import { requireRole } from "./auth/requireRole";
import {
  defaultInviteUserByEmail,
  InviteNotConfiguredError,
  isValidEmail,
} from "./services/inviteStaff";

export type AppDependencies = {
  inviteUserByEmail?: (email: string) => Promise<void>;
};

export function createApp(deps: AppDependencies = {}): Express {
  const app = express();
  app.use(express.json());

  const inviteUserByEmail = deps.inviteUserByEmail ?? defaultInviteUserByEmail;

  app.get("/v1/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/v1/auth/me", requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.status(200).json({
      user_id: req.auth?.userId,
      role: req.auth?.role,
      org_id: req.auth?.orgId,
    });
  });

  app.post(
    "/v1/staff/invite",
    requireAuth,
    requireRole("admin"),
    async (req: AuthenticatedRequest, res: Response) => {
      const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";

      if (!email || !isValidEmail(email)) {
        res.status(400).json({
          code: "bad_request",
          message: "A valid email address is required.",
        });
        return;
      }

      try {
        await inviteUserByEmail(email);
        res.status(202).json({
          status: "invited",
          email,
          org_id: req.auth?.orgId,
        });
      } catch (error) {
        if (error instanceof InviteNotConfiguredError) {
          res.status(503).json({
            code: "service_unavailable",
            message: error.message,
          });
          return;
        }

        res.status(502).json({
          code: "invite_failed",
          message: error instanceof Error ? error.message : "Invite request failed.",
        });
      }
    },
  );

  return app;
}
