import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../auth/authMiddleware";
import type { StaffInviteService } from "../services/staffInviteService";

export async function getInvitePreview(
  req: Request,
  res: Response,
  staffInviteService: StaffInviteService,
): Promise<void> {
  const rawToken = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
  const token = decodeURIComponent(rawToken ?? "").trim();
  if (!token || token.length > 512) {
    res.status(404).json({ code: "not_found", message: "Invite link is invalid or expired." });
    return;
  }
  try {
    const preview = await staffInviteService.previewByToken(token);
    if (!preview) {
      res.status(404).json({ code: "not_found", message: "Invite link is invalid or expired." });
      return;
    }
    res.status(200).json(preview);
  } catch {
    res.status(404).json({ code: "not_found", message: "Invite link is invalid or expired." });
  }
}

export async function postAcceptInvite(
  req: AuthenticatedRequest,
  res: Response,
  staffInviteService: StaffInviteService,
): Promise<void> {
  const userId = req.auth?.userId;
  const userEmail = req.auth?.email?.trim();
  const userName = req.auth?.name?.trim();
  const provider = req.auth?.provider?.trim();
  const token = typeof req.body?.invite_token === "string" ? req.body.invite_token.trim() : "";
  if (!userId || !userEmail) {
    res.status(401).json({ code: "unauthorized", message: "Authentication is required." });
    return;
  }
  if (!token) {
    res.status(400).json({ code: "bad_request", message: "invite_token is required." });
    return;
  }
  const accepted = await staffInviteService.acceptByToken({
    token,
    userId,
    userEmail,
    userName,
    provider,
  });
  if (!accepted) {
    res.status(404).json({ code: "not_found", message: "Invite link is invalid, expired, or mismatched." });
    return;
  }
  res.status(200).json(accepted);
}
