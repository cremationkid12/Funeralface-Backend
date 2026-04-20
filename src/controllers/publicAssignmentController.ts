import type { Request, Response } from "express";
import type { FamilyTokenService } from "../services/familyTokenService";

export async function getAssignmentByPublicToken(
  req: Request,
  res: Response,
  familyTokenService: FamilyTokenService,
): Promise<void> {
  const raw = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
  const token = decodeURIComponent(raw ?? "").trim();
  if (!token || token.length > 512) {
    res.status(404).json({
      code: "not_found",
      message: "Resource was not found.",
    });
    return;
  }

  const outcome = await familyTokenService.resolveByToken(token);
  if (outcome.type === "not_found") {
    res.status(404).json({
      code: "not_found",
      message: "Resource was not found.",
    });
    return;
  }
  if (outcome.type === "expired") {
    res.status(410).json({
      code: "token_expired",
      message: "This link has expired.",
    });
    return;
  }
  res.status(200).json(outcome.view);
}
