import express from "express";
import type { Express, Request, Response } from "express";
import { requireAuth, type AuthenticatedRequest } from "./auth/authMiddleware";
import { requireRole } from "./auth/requireRole";
import {
  defaultInviteUserByEmail,
  InviteNotConfiguredError,
  isValidEmail,
} from "./services/inviteStaff";
import {
  defaultSettingsService,
  type SettingsService,
  type SettingsUpdateInput,
} from "./services/settingsService";
import {
  defaultStaffService,
  type StaffCreateInput,
  type StaffService,
  type StaffUpdateInput,
} from "./services/staffService";
import {
  defaultAssignmentService,
  isAssignmentStatus,
  type AssignmentCreateInput,
  type AssignmentStatus,
  type AssignmentService,
  type AssignmentUpdateInput,
} from "./services/assignmentService";

export type AppDependencies = {
  inviteUserByEmail?: (email: string) => Promise<void>;
  settingsService?: SettingsService;
  staffService?: StaffService;
  assignmentService?: AssignmentService;
};

export function createApp(deps: AppDependencies = {}): Express {
  const app = express();
  app.use(express.json());

  const inviteUserByEmail = deps.inviteUserByEmail ?? defaultInviteUserByEmail;
  const settingsService = deps.settingsService ?? defaultSettingsService;
  const staffService = deps.staffService ?? defaultStaffService;
  const assignmentService = deps.assignmentService ?? defaultAssignmentService;

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

  app.get("/v1/settings", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const orgId = req.auth?.orgId;
    if (!orgId) {
      res.status(401).json({
        code: "unauthorized",
        message: "Authentication is required.",
      });
      return;
    }

    const settings = await settingsService.getByOrgId(orgId);
    res.status(200).json(settings);
  });

  app.patch("/v1/settings", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const orgId = req.auth?.orgId;
    if (!orgId) {
      res.status(401).json({
        code: "unauthorized",
        message: "Authentication is required.",
      });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const allowedKeys: (keyof SettingsUpdateInput)[] = [
      "funeral_home_name",
      "funeral_home_phone",
      "funeral_home_address",
      "logo_url",
      "default_message",
    ];

    const update: SettingsUpdateInput = {};
    for (const key of allowedKeys) {
      const value = body[key];
      if (typeof value === "string") {
        update[key] = value;
      } else if ((key === "logo_url" || key === "default_message") && value === null) {
        update[key] = null;
      }
    }

    if (Object.keys(update).length === 0) {
      res.status(400).json({
        code: "bad_request",
        message: "At least one valid settings field is required.",
      });
      return;
    }

    const updated = await settingsService.upsertByOrgId(orgId, update);
    res.status(200).json(updated);
  });

  app.get("/v1/staff", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const orgId = req.auth?.orgId;
    if (!orgId) {
      res.status(401).json({
        code: "unauthorized",
        message: "Authentication is required.",
      });
      return;
    }

    const sort = typeof req.query.sort === "string" ? req.query.sort : undefined;
    const page = typeof req.query.page === "string" ? Number(req.query.page) : undefined;
    const pageSize = typeof req.query.page_size === "string" ? Number(req.query.page_size) : undefined;

    const items = await staffService.listByOrgId(orgId, { sort, page, pageSize });
    res.status(200).json({ items });
  });

  app.post("/v1/staff", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const orgId = req.auth?.orgId;
    if (!orgId) {
      res.status(401).json({
        code: "unauthorized",
        message: "Authentication is required.",
      });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const email = typeof body.email === "string" ? body.email : null;
    const role = typeof body.role === "string" ? body.role : undefined;

    if (!name || !phone) {
      res.status(400).json({
        code: "bad_request",
        message: "Both name and phone are required.",
      });
      return;
    }

    const created = await staffService.createByOrgId(orgId, {
      name,
      phone,
      email,
      role,
    } satisfies StaffCreateInput);
    res.status(201).json(created);
  });

  app.patch("/v1/staff/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const orgId = req.auth?.orgId;
    if (!orgId) {
      res.status(401).json({
        code: "unauthorized",
        message: "Authentication is required.",
      });
      return;
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const body = req.body as Record<string, unknown>;
    const update: StaffUpdateInput = {};
    if (typeof body.name === "string") update.name = body.name;
    if (typeof body.phone === "string") update.phone = body.phone;
    if (typeof body.email === "string" || body.email === null) update.email = body.email as string | null;
    if (typeof body.role === "string") update.role = body.role;

    if (Object.keys(update).length === 0) {
      res.status(400).json({
        code: "bad_request",
        message: "At least one valid staff field is required.",
      });
      return;
    }

    const updated = await staffService.updateByOrgIdAndId(orgId, id, update);
    if (!updated) {
      res.status(404).json({
        code: "not_found",
        message: "Resource was not found.",
      });
      return;
    }
    res.status(200).json(updated);
  });

  app.delete("/v1/staff/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const orgId = req.auth?.orgId;
    if (!orgId) {
      res.status(401).json({
        code: "unauthorized",
        message: "Authentication is required.",
      });
      return;
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const deleted = await staffService.deleteByOrgIdAndId(orgId, id);
    if (!deleted) {
      res.status(404).json({
        code: "not_found",
        message: "Resource was not found.",
      });
      return;
    }

    res.status(204).send();
  });

  app.get("/v1/assignments", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const orgId = req.auth?.orgId;
    if (!orgId) {
      res.status(401).json({
        code: "unauthorized",
        message: "Authentication is required.",
      });
      return;
    }
    const sort = typeof req.query.sort === "string" ? req.query.sort : "-created_at";
    const items = await assignmentService.listByOrgId(orgId, sort);
    res.status(200).json({ items });
  });

  app.post("/v1/assignments", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const orgId = req.auth?.orgId;
    if (!orgId) {
      res.status(401).json({
        code: "unauthorized",
        message: "Authentication is required.",
      });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const decedent_name = typeof body.decedent_name === "string" ? body.decedent_name : "";
    const pickup_address = typeof body.pickup_address === "string" ? body.pickup_address : "";
    const contact_name = typeof body.contact_name === "string" ? body.contact_name : "";
    const contact_phone = typeof body.contact_phone === "string" ? body.contact_phone : "";
    const notes = typeof body.notes === "string" ? body.notes : null;
    const assigned_staff_id = typeof body.assigned_staff_id === "string" ? body.assigned_staff_id : null;
    const rawStatus = typeof body.status === "string" ? body.status : undefined;
    let status: AssignmentStatus | undefined;

    if (!decedent_name || !pickup_address || !contact_name || !contact_phone) {
      res.status(400).json({
        code: "bad_request",
        message: "decedent_name, pickup_address, contact_name, and contact_phone are required.",
      });
      return;
    }

    if (rawStatus && !isAssignmentStatus(rawStatus)) {
      res.status(400).json({
        code: "bad_request",
        message: "Invalid assignment status.",
      });
      return;
    }
    if (rawStatus && isAssignmentStatus(rawStatus)) {
      status = rawStatus;
    }

    const created = await assignmentService.createByOrgId(orgId, {
      decedent_name,
      pickup_address,
      contact_name,
      contact_phone,
      notes,
      assigned_staff_id,
      status,
    } satisfies AssignmentCreateInput);
    res.status(201).json(created);
  });

  app.patch("/v1/assignments/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const orgId = req.auth?.orgId;
    const actorUserId = req.auth?.userId;
    if (!orgId || !actorUserId) {
      res.status(401).json({
        code: "unauthorized",
        message: "Authentication is required.",
      });
      return;
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const body = req.body as Record<string, unknown>;
    const update: AssignmentUpdateInput = {};
    if (typeof body.decedent_name === "string") update.decedent_name = body.decedent_name;
    if (typeof body.pickup_address === "string") update.pickup_address = body.pickup_address;
    if (typeof body.contact_name === "string") update.contact_name = body.contact_name;
    if (typeof body.contact_phone === "string") update.contact_phone = body.contact_phone;
    if (typeof body.notes === "string" || body.notes === null) update.notes = body.notes as string | null;
    if (typeof body.assigned_staff_id === "string" || body.assigned_staff_id === null) {
      update.assigned_staff_id = body.assigned_staff_id as string | null;
    }
    if (typeof body.status === "string") {
      if (!isAssignmentStatus(body.status)) {
        res.status(400).json({
          code: "bad_request",
          message: "Invalid assignment status.",
        });
        return;
      }
      update.status = body.status;
    }

    if (Object.keys(update).length === 0) {
      res.status(400).json({
        code: "bad_request",
        message: "At least one valid assignment field is required.",
      });
      return;
    }

    try {
      const updated = await assignmentService.updateByOrgIdAndId(orgId, id, update, actorUserId);
      if (!updated) {
        res.status(404).json({
          code: "not_found",
          message: "Resource was not found.",
        });
        return;
      }
      res.status(200).json(updated);
    } catch (error) {
      if (error instanceof Error && error.name === "InvalidStatusTransitionError") {
        res.status(400).json({
          code: "bad_request",
          message: error.message,
        });
        return;
      }
      throw error;
    }
  });

  return app;
}
