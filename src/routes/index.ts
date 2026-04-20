import type { Express } from "express";
import type { AppServices } from "../appServices";
import { createAssignmentRouter } from "./assignmentRoutes";
import { createAuthRouter } from "./authRoutes";
import { createHealthRouter } from "./healthRoutes";
import { createPublicRouter } from "./publicRoutes";
import { createSettingsRouter } from "./settingsRoutes";
import { createStaffRouter } from "./staffRoutes";

export function registerV1Routes(app: Express, services: AppServices): void {
  app.use("/v1", createHealthRouter());
  app.use("/v1/auth", createAuthRouter(services));
  app.use("/v1/settings", createSettingsRouter(services));
  app.use("/v1/staff", createStaffRouter(services));
  app.use("/v1/assignments", createAssignmentRouter(services));
  app.use("/v1/public", createPublicRouter(services));
}
