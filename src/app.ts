import express from "express";
import type { Express, RequestHandler } from "express";
import type { AppServices } from "./appServices";
import { registerV1Routes } from "./routes";
import { setupSwaggerUi } from "./swaggerUi";
import { defaultInviteUserByEmail } from "./services/inviteStaff";
import { defaultSettingsService, type SettingsService } from "./services/settingsService";
import { defaultStaffService, type StaffService } from "./services/staffService";
import {
  defaultAssignmentService,
  type AssignmentService,
} from "./services/assignmentService";
import { createPublicTokenRateLimit } from "./middleware/publicTokenRateLimit";
import { defaultFamilyTokenService, type FamilyTokenService } from "./services/familyTokenService";
import { defaultAuthService, type AuthService } from "./services/authService";

export type AppDependencies = {
  authService?: AuthService;
  inviteUserByEmail?: (email: string) => Promise<void>;
  settingsService?: SettingsService;
  staffService?: StaffService;
  assignmentService?: AssignmentService;
  familyTokenService?: FamilyTokenService;
  /** Override default in-memory rate limit (e.g. tests). */
  publicTokenRateLimit?: RequestHandler;
};

export function createApp(deps: AppDependencies = {}): Express {
  const app = express();
  app.use(express.json());

  const services: AppServices = {
    inviteUserByEmail: deps.inviteUserByEmail ?? defaultInviteUserByEmail,
    authService: deps.authService ?? defaultAuthService,
    settingsService: deps.settingsService ?? defaultSettingsService,
    staffService: deps.staffService ?? defaultStaffService,
    assignmentService: deps.assignmentService ?? defaultAssignmentService,
    familyTokenService: deps.familyTokenService ?? defaultFamilyTokenService,
    publicTokenRateLimit:
      deps.publicTokenRateLimit ??
      createPublicTokenRateLimit({
        windowMs: Number(process.env.PUBLIC_FAMILY_TOKEN_RATE_LIMIT_WINDOW_MS ?? 60_000),
        max: Number(process.env.PUBLIC_FAMILY_TOKEN_RATE_LIMIT_MAX ?? 60),
      }),
  };

  registerV1Routes(app, services);
  setupSwaggerUi(app);

  return app;
}
