import fs from "fs";
import path from "path";
import type { Express } from "express";
import swaggerUi from "swagger-ui-express";
import { parse as parseYaml } from "yaml";

function resolveOpenApiPath(): string {
  const candidates = [
    path.join(process.cwd(), "openapi.yaml"),
    path.join(__dirname, "..", "openapi.yaml"),
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  throw new Error(
    `openapi.yaml not found (tried: ${candidates.join(", ")}). Run the server from the package root.`,
  );
}

function loadOpenApiDocument(filePath: string): Record<string, unknown> {
  const raw = fs.readFileSync(filePath, "utf8");
  const doc = parseYaml(raw) as Record<string, unknown>;
  const base =
    typeof process.env.SWAGGER_SERVER_URL === "string" && process.env.SWAGGER_SERVER_URL.trim()
      ? process.env.SWAGGER_SERVER_URL.trim()
      : "/";
  doc.servers = [{ url: base, description: "This server (Try it out)" }];
  return doc;
}

/**
 * Serves interactive API docs from the repo's `openapi.yaml`.
 * Set `ENABLE_SWAGGER_UI=false` to disable (e.g. locked-down production).
 * Optional `SWAGGER_SERVER_URL` (e.g. `http://localhost:8010`) fixes "Try it out" when UI is opened from another origin.
 */
export function setupSwaggerUi(app: Express): void {
  if (process.env.ENABLE_SWAGGER_UI?.trim().toLowerCase() === "false") {
    return;
  }
  const openApiPath = path.resolve(resolveOpenApiPath());
  const spec = loadOpenApiDocument(openApiPath);
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: "Funeralface API docs" }));
  app.get("/openapi.yaml", (_req, res) => {
    res.type("application/yaml").sendFile(openApiPath);
  });
}
