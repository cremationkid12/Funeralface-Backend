import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/authMiddleware";
import {
  isAssignmentStatus,
  type AssignmentCreateInput,
  type AssignmentService,
  type AssignmentStatus,
  type AssignmentUpdateInput,
} from "../services/assignmentService";

export async function getAssignments(
  req: AuthenticatedRequest,
  res: Response,
  assignmentService: AssignmentService,
): Promise<void> {
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
}

export async function postAssignment(
  req: AuthenticatedRequest,
  res: Response,
  assignmentService: AssignmentService,
): Promise<void> {
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
}

export async function patchAssignment(
  req: AuthenticatedRequest,
  res: Response,
  assignmentService: AssignmentService,
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

  if ("share_token" in body) {
    if (body.share_token === null) {
      update.share_token = null;
    } else if (typeof body.share_token === "string") {
      const trimmed = body.share_token.trim();
      update.share_token = trimmed.length === 0 ? null : trimmed;
    }
  }
  if ("share_token_expires_at" in body) {
    if (body.share_token_expires_at === null || body.share_token_expires_at === "") {
      update.share_token_expires_at = null;
    } else if (typeof body.share_token_expires_at === "string") {
      update.share_token_expires_at = body.share_token_expires_at;
    }
  }
  if (typeof body.share_token_one_time === "boolean") {
    update.share_token_one_time = body.share_token_one_time;
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
    if (error instanceof Error && error.name === "InvalidShareTokenFieldsError") {
      res.status(400).json({
        code: "bad_request",
        message: error.message,
      });
      return;
    }
    throw error;
  }
}
