import { randomUUID } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type UploadPurpose = "funeral_home_logo" | "staff_photo";

export type UploadImageInput = {
  orgId: string;
  uploadedByUserId: string;
  purpose: UploadPurpose;
  fileBuffer: Buffer;
  mimeType: string;
  fileExtension: string;
  referenceId?: string;
};

export type UploadImageResult = {
  bucket: string;
  objectPath: string;
  publicUrl: string;
  purpose: UploadPurpose;
};

export type StorageUploadService = {
  uploadImage: (input: UploadImageInput) => Promise<UploadImageResult>;
};

const DEFAULT_STORAGE_BUCKET = "funeralface-assets";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for storage uploads.`);
  return value;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeExtension(extension: string): string {
  const cleaned = extension.trim().toLowerCase().replace(/\./g, "");
  return cleaned || "png";
}

function sanitizePathPart(value: string): string {
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  return cleaned || "unknown";
}

function pathSegmentForPurpose(purpose: UploadPurpose): string {
  if (purpose === "staff_photo") return "staff";
  return "logos";
}

function contentTypeForExtension(extension: string): string {
  switch (normalizeExtension(extension)) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    default:
      return "image/png";
  }
}

let storageClient: SupabaseClient | null = null;

function getStorageClient(): SupabaseClient {
  if (storageClient) return storageClient;
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const role = decodeJwtPayload(serviceRoleKey)?.role;
  if (role !== "service_role") {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is invalid for uploads. Use the service_role key (not anon key).",
    );
  }
  storageClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return storageClient;
}

export const defaultStorageUploadService: StorageUploadService = {
  async uploadImage(input: UploadImageInput): Promise<UploadImageResult> {
    if (!input.orgId.trim()) {
      throw new Error("orgId is required.");
    }
    if (!input.uploadedByUserId.trim()) {
      throw new Error("uploadedByUserId is required.");
    }
    if (!input.fileBuffer.length) {
      throw new Error("Image file is required.");
    }

    const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || DEFAULT_STORAGE_BUCKET;
    const ext = normalizeExtension(input.fileExtension);
    const purposeSegment = pathSegmentForPurpose(input.purpose);
    const referenceSegment = input.referenceId
      ? `${sanitizePathPart(input.referenceId)}/`
      : "";
    const objectPath =
      `orgs/${sanitizePathPart(input.orgId)}/${purposeSegment}/${referenceSegment}` +
      `${Date.now()}_${randomUUID()}.${ext}`;
    const client = getStorageClient();

    const { error: uploadError } = await client.storage.from(bucket).upload(objectPath, input.fileBuffer, {
      upsert: true,
      contentType: input.mimeType || contentTypeForExtension(ext),
    });
    if (uploadError) {
      if (uploadError.message.toLowerCase().includes("bucket")) {
        throw new Error(
          `Storage bucket "${bucket}" is not available. Create it in Supabase Storage or update SUPABASE_STORAGE_BUCKET.`,
        );
      }
      throw new Error(uploadError.message);
    }

    const { data: publicData } = client.storage.from(bucket).getPublicUrl(objectPath);
    const publicUrl = publicData.publicUrl;
    if (!publicUrl) {
      throw new Error("Could not build storage public URL.");
    }

    return {
      bucket,
      objectPath,
      publicUrl,
      purpose: input.purpose,
    };
  },
};
