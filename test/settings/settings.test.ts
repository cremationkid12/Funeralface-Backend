import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createApp } from "../../src/app";
import type { SettingsRecord, SettingsService, SettingsUpdateInput } from "../../src/services/settingsService";

const JWT_SECRET = "test-secret-settings";

function makeToken(orgId: string, role = "admin"): string {
  return jwt.sign({ sub: "user-1", role, org_id: orgId }, JWT_SECRET);
}

function createInMemorySettingsService(): SettingsService {
  const store = new Map<string, SettingsRecord>();

  return {
    async getByOrgId(orgId: string): Promise<SettingsRecord> {
      return (
        store.get(orgId) ?? {
          org_id: orgId,
          funeral_home_name: "",
          funeral_home_phone: "",
          funeral_home_address: "",
          logo_url: null,
          default_message: null,
        }
      );
    },

    async upsertByOrgId(orgId: string, input: SettingsUpdateInput): Promise<SettingsRecord> {
      const current = await this.getByOrgId(orgId);
      const next: SettingsRecord = {
        ...current,
        ...input,
        org_id: orgId,
      };
      store.set(orgId, next);
      return next;
    },
  };
}

test.before(() => {
  process.env.JWT_SECRET = JWT_SECRET;
});

test("GET /v1/settings returns 401 without token", async () => {
  const app = createApp({ settingsService: createInMemorySettingsService() });
  const response = await request(app).get("/v1/settings");
  assert.equal(response.status, 401);
});

test("GET /v1/settings returns org-scoped default settings", async () => {
  const app = createApp({ settingsService: createInMemorySettingsService() });
  const response = await request(app)
    .get("/v1/settings")
    .set("Authorization", `Bearer ${makeToken("org-1")}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.org_id, "org-1");
});

test("PATCH /v1/settings updates only authenticated org data", async () => {
  const settingsService = createInMemorySettingsService();
  const app = createApp({ settingsService });

  const patchResponse = await request(app)
    .patch("/v1/settings")
    .set("Authorization", `Bearer ${makeToken("org-1")}`)
    .send({
      funeral_home_name: "Memorial Home",
      funeral_home_phone: "555-1111",
      funeral_home_address: "123 Main St",
    });

  assert.equal(patchResponse.status, 200);
  assert.equal(patchResponse.body.funeral_home_name, "Memorial Home");

  const org2Response = await request(app)
    .get("/v1/settings")
    .set("Authorization", `Bearer ${makeToken("org-2")}`);

  assert.equal(org2Response.status, 200);
  assert.equal(org2Response.body.funeral_home_name, "");
});

test("PATCH /v1/settings returns 400 for invalid payload", async () => {
  const app = createApp({ settingsService: createInMemorySettingsService() });
  const response = await request(app)
    .patch("/v1/settings")
    .set("Authorization", `Bearer ${makeToken("org-1")}`)
    .send({ unsupported_field: "x" });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "bad_request");
});

