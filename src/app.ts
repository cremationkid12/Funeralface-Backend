import express from "express";
import type { Express, RequestHandler } from "express";
import type { AppServices } from "./appServices";
import { registerV1Routes } from "./routes";
import { setupSwaggerUi } from "./swaggerUi";
import { defaultInviteUserByEmail, type InviteByEmailInput } from "./services/inviteStaff";
import { defaultSettingsService, type SettingsService } from "./services/settingsService";
import { defaultStaffService, type StaffService } from "./services/staffService";
import {
  defaultAssignmentService,
  type AssignmentService,
} from "./services/assignmentService";
import { createPublicTokenRateLimit } from "./middleware/publicTokenRateLimit";
import { defaultFamilyTokenService, type FamilyTokenService } from "./services/familyTokenService";
import { defaultAuthService, type AuthService } from "./services/authService";
import {
  createDefaultStaffInviteService,
  type StaffInviteService,
} from "./services/staffInviteService";
import { defaultStorageUploadService, type StorageUploadService } from "./services/storageUploadService";

export type AppDependencies = {
  authService?: AuthService;
  inviteUserByEmail?: (input: InviteByEmailInput) => Promise<void>;
  staffInviteService?: StaffInviteService;
  settingsService?: SettingsService;
  staffService?: StaffService;
  assignmentService?: AssignmentService;
  familyTokenService?: FamilyTokenService;
  storageUploadService?: StorageUploadService;
  /** Override default in-memory rate limit (e.g. tests). */
  publicTokenRateLimit?: RequestHandler;
};

export function createApp(deps: AppDependencies = {}): Express {
  const app = express();

  const allowedOrigins = new Set(
    (process.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
    if (req.method === "OPTIONS") {
      res.status(204).send();
      return;
    }
    next();
  });

  app.use(express.json());
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      console.log(
        `[API] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs.toFixed(1)}ms)`,
      );
    });
    next();
  });

  const services: AppServices = {
    inviteUserByEmail: deps.inviteUserByEmail ?? (() => Promise.reject(new Error("Invite service is not configured."))),
    authService: deps.authService ?? defaultAuthService,
    settingsService: deps.settingsService ?? defaultSettingsService,
    staffService: deps.staffService ?? defaultStaffService,
    assignmentService: deps.assignmentService ?? defaultAssignmentService,
    familyTokenService: deps.familyTokenService ?? defaultFamilyTokenService,
    storageUploadService: deps.storageUploadService ?? defaultStorageUploadService,
    publicTokenRateLimit:
      deps.publicTokenRateLimit ??
      createPublicTokenRateLimit({
        windowMs: Number(process.env.PUBLIC_FAMILY_TOKEN_RATE_LIMIT_WINDOW_MS ?? 60_000),
        max: Number(process.env.PUBLIC_FAMILY_TOKEN_RATE_LIMIT_MAX ?? 60),
      }),
    staffInviteService:
      deps.staffInviteService ?? createDefaultStaffInviteService(defaultInviteUserByEmail),
  };

  if (!deps.inviteUserByEmail) {
    services.inviteUserByEmail = async (input: InviteByEmailInput) => {
      if (!input.orgId || !input.invitedByUserId) {
        throw new Error("Invite context is required.");
      }
      await services.staffInviteService.createAndSend({
        ...input,
        orgId: input.orgId,
        invitedByUserId: input.invitedByUserId,
      });
    };
  }

  registerV1Routes(app, services);
  setupSwaggerUi(app);

  return app;
}
