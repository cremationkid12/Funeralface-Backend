import multer from "multer";
import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { requireAuth, type AuthenticatedRequest } from "../auth/authMiddleware";
import type { AppServices } from "../appServices";
import { postUploadImage } from "../controllers/uploadController";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.UPLOAD_IMAGE_MAX_BYTES ?? 5 * 1024 * 1024),
  },
});

function handleMulterError(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (!(error instanceof multer.MulterError)) {
    next(error);
    return;
  }

  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message : "Upload failed.";

  if (code === "LIMIT_FILE_SIZE") {
    res.status(400).json({
      code: "bad_request",
      message: "Image exceeds max size limit.",
    });
    return;
  }

  res.status(400).json({
    code: "bad_request",
    message,
  });
}

export function createUploadRouter(services: AppServices): Router {
  const router = Router();

  router.post(
    "/image",
    requireAuth,
    upload.single("file"),
    (req: Request, res: Response) =>
      postUploadImage(req as AuthenticatedRequest, res, services.storageUploadService),
  );

  router.use(handleMulterError);
  return router;
}
