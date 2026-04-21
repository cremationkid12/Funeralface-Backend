import type { RequestHandler } from "express";
import type { AuthService } from "./services/authService";
import type { AssignmentService } from "./services/assignmentService";
import type { FamilyTokenService } from "./services/familyTokenService";
import type { SettingsService } from "./services/settingsService";
import type { StaffService } from "./services/staffService";
import type { InviteByEmailInput } from "./services/inviteStaff";

/** Concrete dependencies after `createApp` applies defaults (used by routes/controllers). */
export type AppServices = {
  inviteUserByEmail: (input: InviteByEmailInput) => Promise<void>;
  authService: AuthService;
  settingsService: SettingsService;
  staffService: StaffService;
  assignmentService: AssignmentService;
  familyTokenService: FamilyTokenService;
  publicTokenRateLimit: RequestHandler;
};
