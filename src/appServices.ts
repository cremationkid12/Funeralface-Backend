import type { RequestHandler } from "express";
import type { AuthService } from "./services/authService";
import type { AssignmentService } from "./services/assignmentService";
import type { FamilyTokenService } from "./services/familyTokenService";
import type { SettingsService } from "./services/settingsService";
import type { StaffService } from "./services/staffService";

/** Concrete dependencies after `createApp` applies defaults (used by routes/controllers). */
export type AppServices = {
  inviteUserByEmail: (email: string) => Promise<void>;
  authService: AuthService;
  settingsService: SettingsService;
  staffService: StaffService;
  assignmentService: AssignmentService;
  familyTokenService: FamilyTokenService;
  publicTokenRateLimit: RequestHandler;
};
