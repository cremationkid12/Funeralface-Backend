import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/authMiddleware";
import { InviteNotConfiguredError, isValidEmail, type InviteByEmailInput } from "../services/inviteStaff";
import type {
  StaffCreateInput,
  StaffService,
  StaffUpdateInput,
} from "../services/staffService";

export async function postStaffInvite(
  req: AuthenticatedRequest,
  res: Response,
  inviteUserByEmail: (input: InviteByEmailInput) => Promise<void>,
): Promise<void> {
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const senderName = req.auth?.name;
  const senderEmail = req.auth?.email;
  const orgId = req.auth?.orgId;
  const invitedByUserId = req.auth?.userId;

  if (!email || !isValidEmail(email)) {
    res.status(400).json({
      code: "bad_request",
      message: "A valid email address is required.",
    });
    return;
  }

  try {
    if (!orgId || !invitedByUserId) {
      res.status(401).json({
        code: "unauthorized",
        message: "Authentication is required.",
      });
      return;
    }
    await inviteUserByEmail({
      email,
      orgId,
      invitedByUserId,
      senderName: senderName || undefined,
      senderEmail: senderEmail || undefined,
    });
    res.status(202).json({
      status: "invited",
      email,
      org_id: req.auth?.orgId,
    });
  } catch (error) {
    const notConfigured =
      error instanceof InviteNotConfiguredError ||
      (error instanceof Error && /DATABASE_URL is required for invite workflow/i.test(error.message));
    if (notConfigured) {
      res.status(503).json({
        code: "service_unavailable",
        message:
          error instanceof Error
            ? error.message
            : "Invite service is not configured.",
      });
      return;
    }

    res.status(502).json({
      code: "invite_failed",
      message: error instanceof Error ? error.message : "Invite request failed.",
    });
  }
}

export async function getStaffList(
  req: AuthenticatedRequest,
  res: Response,
  staffService: StaffService,
): Promise<void> {
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
  const pageSize =
    typeof req.query.page_size === "string" ? Number(req.query.page_size) : undefined;

  const items = await staffService.listByOrgId(orgId, { sort, page, pageSize });
  res.status(200).json({ items });
}

export async function getMyStaffProfile(
  req: AuthenticatedRequest,
  res: Response,
  staffService: StaffService,
): Promise<void> {
  const orgId = req.auth?.orgId;
  const userId = req.auth?.userId;
  if (!orgId || !userId) {
    res.status(401).json({
      code: "unauthorized",
      message: "Authentication is required.",
    });
    return;
  }

  const staff = await staffService.getByOrgIdAndId(orgId, userId);
  if (!staff) {
    res.status(404).json({
      code: "not_found",
      message: "Resource was not found.",
    });
    return;
  }
  res.status(200).json(staff);
}

export async function postStaff(
  req: AuthenticatedRequest,
  res: Response,
  staffService: StaffService,
): Promise<void> {
  const orgId = req.auth?.orgId;
  const actorUserId = req.auth?.userId;
  if (!orgId) {
    res.status(401).json({
      code: "unauthorized",
      message: "Authentication is required.",
    });
    return;
  }
  if (!actorUserId) {
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
  const bio = typeof body.bio === "string" ? body.bio : null;
  const role = typeof body.role === "string" ? body.role : undefined;
  const active = typeof body.active === "boolean" ? body.active : undefined;

  if (!name || !phone) {
    res.status(400).json({
      code: "bad_request",
      message: "Both name and phone are required.",
    });
    return;
  }

  const created = await staffService.createByOrgId(
    orgId,
    {
      name,
      phone,
      email,
      bio,
      role,
      active,
    } satisfies StaffCreateInput,
    actorUserId,
  );
  res.status(201).json(created);
}

export async function patchStaff(
  req: AuthenticatedRequest,
  res: Response,
  staffService: StaffService,
): Promise<void> {
  const orgId = req.auth?.orgId;
  const actorUserId = req.auth?.userId;
  if (!orgId) {
    res.status(401).json({
      code: "unauthorized",
      message: "Authentication is required.",
    });
    return;
  }
  if (!actorUserId) {
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
  if (typeof body.bio === "string" || body.bio === null) update.bio = body.bio as string | null;
  if (typeof body.profile_image_url === "string" || body.profile_image_url === null) {
    update.profile_image_url = body.profile_image_url as string | null;
  }
  if (typeof body.role === "string") update.role = body.role;
  if (typeof body.active === "boolean") update.active = body.active;

  if (Object.keys(update).length === 0) {
    res.status(400).json({
      code: "bad_request",
      message: "At least one valid staff field is required.",
    });
    return;
  }

  const updated = await staffService.updateByOrgIdAndId(orgId, id, update, actorUserId);
  if (!updated) {
    res.status(404).json({
      code: "not_found",
      message: "Resource was not found.",
    });
    return;
  }
  res.status(200).json(updated);
}

export async function patchMyStaffProfile(
  req: AuthenticatedRequest,
  res: Response,
  staffService: StaffService,
): Promise<void> {
  const orgId = req.auth?.orgId;
  const actorUserId = req.auth?.userId;
  if (!orgId || !actorUserId) {
    res.status(401).json({
      code: "unauthorized",
      message: "Authentication is required.",
    });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const update: StaffUpdateInput = {};
  if (typeof body.name === "string") update.name = body.name;
  if (typeof body.phone === "string") update.phone = body.phone;
  if (typeof body.email === "string" || body.email === null) update.email = body.email as string | null;
  if (typeof body.bio === "string" || body.bio === null) update.bio = body.bio as string | null;
  if (typeof body.profile_image_url === "string" || body.profile_image_url === null) {
    update.profile_image_url = body.profile_image_url as string | null;
  }

  if (Object.keys(update).length === 0) {
    res.status(400).json({
      code: "bad_request",
      message: "At least one valid profile field is required.",
    });
    return;
  }

  const updated = await staffService.updateByOrgIdAndId(orgId, actorUserId, update, actorUserId);
  if (!updated) {
    res.status(404).json({
      code: "not_found",
      message: "Resource was not found.",
    });
    return;
  }
  res.status(200).json(updated);
}

export async function deleteStaff(
  req: AuthenticatedRequest,
  res: Response,
  staffService: StaffService,
): Promise<void> {
  const orgId = req.auth?.orgId;
  const actorUserId = req.auth?.userId;
  if (!orgId) {
    res.status(401).json({
      code: "unauthorized",
      message: "Authentication is required.",
    });
    return;
  }
  if (!actorUserId) {
    res.status(401).json({
      code: "unauthorized",
      message: "Authentication is required.",
    });
    return;
  }

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const deleted = await staffService.deleteByOrgIdAndId(orgId, id, actorUserId);
  if (!deleted) {
    res.status(404).json({
      code: "not_found",
      message: "Resource was not found.",
    });
    return;
  }

  res.status(204).send();
}

export async function postStaffActivate(
  req: AuthenticatedRequest,
  res: Response,
  staffService: StaffService,
): Promise<void> {
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
  const updated = await staffService.updateByOrgIdAndId(orgId, id, { active: true }, actorUserId);
  if (!updated) {
    res.status(404).json({
      code: "not_found",
      message: "Resource was not found.",
    });
    return;
  }
  res.status(200).json(updated);
}

export async function postStaffDeactivate(
  req: AuthenticatedRequest,
  res: Response,
  staffService: StaffService,
): Promise<void> {
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
  const updated = await staffService.updateByOrgIdAndId(orgId, id, { active: false }, actorUserId);
  if (!updated) {
    res.status(404).json({
      code: "not_found",
      message: "Resource was not found.",
    });
    return;
  }
  res.status(200).json(updated);
}
