import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/authMiddleware";
import type { StorageUploadService, UploadPurpose } from "../services/storageUploadService";

const ALLOWED_PURPOSES: UploadPurpose[] = ["funeral_home_logo", "staff_photo"];
const ALLOWED_PURPOSE_SET = new Set<UploadPurpose>(ALLOWED_PURPOSES);
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);
const GENERIC_OCTET_STREAM = "application/octet-stream";

function mimeTypeForExtension(ext: string): string {
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    default:
      return "";
  }
}

function normalizeExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  if (idx < 0 || idx + 1 >= fileName.length) return "png";
  return fileName.slice(idx + 1).toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
}

function asUploadPurpose(value: string): UploadPurpose | null {
  return ALLOWED_PURPOSE_SET.has(value as UploadPurpose) ? (value as UploadPurpose) : null;
}

export async function postUploadImage(
  req: AuthenticatedRequest,
  res: Response,
  storageUploadService: StorageUploadService,
): Promise<void> {
  const orgId = req.auth?.orgId?.trim();
  const uploadedByUserId = req.auth?.userId?.trim();
  if (!orgId || !uploadedByUserId) {
    res.status(401).json({
      code: "unauthorized",
      message: "Authentication is required.",
    });
    return;
  }

  const purposeRaw = req.body?.purpose;
  const purpose = typeof purposeRaw === "string" ? asUploadPurpose(purposeRaw.trim()) : null;
  if (!purpose) {
    res.status(400).json({
      code: "bad_request",
      message: "purpose must be one of: funeral_home_logo, staff_photo.",
    });
    return;
  }

  const file = req.file;
  if (!file) {
    res.status(400).json({
      code: "bad_request",
      message: "Image file is required (field: file).",
    });
    return;
  }

  const extension = normalizeExtension(file.originalname);
  const mimeType = file.mimetype.toLowerCase();
  const extensionMimeType = mimeTypeForExtension(extension);
  const resolvedMimeType =
    ALLOWED_MIME_TYPES.has(mimeType)
      ? mimeType
      : mimeType === GENERIC_OCTET_STREAM
      ? extensionMimeType
      : "";

  if (!resolvedMimeType) {
    res.status(400).json({
      code: "bad_request",
      message: "Only PNG, JPEG, WEBP, GIF, and SVG images are allowed.",
    });
    return;
  }

  try {
    const uploaded = await storageUploadService.uploadImage({
      orgId,
      uploadedByUserId,
      purpose,
      fileBuffer: file.buffer,
      mimeType: resolvedMimeType,
      fileExtension: extension,
      referenceId:
        typeof req.body?.reference_id === "string" ? req.body.reference_id.trim() : undefined,
    });
    res.status(200).json({
      purpose: uploaded.purpose,
      bucket: uploaded.bucket,
      object_path: uploaded.objectPath,
      public_url: uploaded.publicUrl,
    });
  } catch (error) {
    res.status(500).json({
      code: "storage_upload_failed",
      message: error instanceof Error ? error.message : "Could not upload image.",
    });
  }
}
