import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/authMiddleware";
import type { SettingsService, SettingsUpdateInput } from "../services/settingsService";

export async function getSettings(
  req: AuthenticatedRequest,
  res: Response,
  settingsService: SettingsService,
): Promise<void> {
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
}

export async function patchSettings(
  req: AuthenticatedRequest,
  res: Response,
  settingsService: SettingsService,
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
      const normalized = value.trim();
      if ((key === "logo_url" || key === "default_message") && normalized.length === 0) {
        update[key] = null;
      } else {
        update[key] = normalized;
      }
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
}
