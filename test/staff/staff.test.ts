import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createApp } from "../../src/app";
import type { StaffCreateInput, StaffMemberRecord, StaffService, StaffUpdateInput } from "../../src/services/staffService";

const JWT_SECRET = "test-secret-staff";

function makeToken(orgId: string): string {
  return jwt.sign({ sub: "user-1", role: "admin", org_id: orgId }, JWT_SECRET);
}

function makeUserToken(orgId: string): string {
  return jwt.sign({ sub: "user-1", role: "user", org_id: orgId }, JWT_SECRET);
}

function createInMemoryStaffService(): StaffService {
  const data = new Map<string, StaffMemberRecord[]>();
  let counter = 1;

  const listFor = (orgId: string) => data.get(orgId) ?? [];

  return {
    async listByOrgId(orgId, input) {
      let items = [...listFor(orgId)];
      if (input.sort === "-created_at") {
        items = items.reverse();
      }
      return items;
    },

    async createByOrgId(orgId, input) {
      const item: StaffMemberRecord = {
        id: `staff-${counter++}`,
        org_id: orgId,
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        role: input.role ?? "user",
        active: input.active ?? true,
      };
      data.set(orgId, [...listFor(orgId), item]);
      return item;
    },

    async updateByOrgIdAndId(orgId, id, input, _actorUserId) {
      const items = listFor(orgId);
      const idx = items.findIndex((i) => i.id === id);
      if (idx < 0) return null;
      const updated = {
        ...items[idx],
        ...input,
      } as StaffMemberRecord;
      const next = [...items];
      next[idx] = updated;
      data.set(orgId, next);
      return updated;
    },

    async deleteByOrgIdAndId(orgId, id) {
      const items = listFor(orgId);
      const next = items.filter((i) => i.id !== id);
      if (next.length === items.length) return false;
      data.set(orgId, next);
      return true;
    },
  };
}

test.before(() => {
  process.env.JWT_SECRET = JWT_SECRET;
});

test("GET /v1/staff returns 401 without token", async () => {
  const app = createApp({ staffService: createInMemoryStaffService() });
  const response = await request(app).get("/v1/staff");
  assert.equal(response.status, 401);
});

test("POST /v1/staff creates staff for authenticated org", async () => {
  const app = createApp({ staffService: createInMemoryStaffService() });
  const response = await request(app)
    .post("/v1/staff")
    .set("Authorization", `Bearer ${makeToken("org-1")}`)
    .send({ name: "Alice", phone: "555-1000", email: "alice@example.com" } satisfies StaffCreateInput);

  assert.equal(response.status, 201);
  assert.equal(response.body.org_id, "org-1");
  assert.equal(response.body.name, "Alice");
});

test("GET /v1/staff is org-scoped", async () => {
  const service = createInMemoryStaffService();
  const app = createApp({ staffService: service });

  await request(app)
    .post("/v1/staff")
    .set("Authorization", `Bearer ${makeToken("org-1")}`)
    .send({ name: "Org1", phone: "111" } satisfies StaffCreateInput);

  await request(app)
    .post("/v1/staff")
    .set("Authorization", `Bearer ${makeToken("org-2")}`)
    .send({ name: "Org2", phone: "222" } satisfies StaffCreateInput);

  const org1 = await request(app).get("/v1/staff").set("Authorization", `Bearer ${makeToken("org-1")}`);
  const org2 = await request(app).get("/v1/staff").set("Authorization", `Bearer ${makeToken("org-2")}`);

  assert.equal(org1.status, 200);
  assert.equal(org2.status, 200);
  assert.equal(org1.body.items.length, 1);
  assert.equal(org2.body.items.length, 1);
  assert.equal(org1.body.items[0].name, "Org1");
  assert.equal(org2.body.items[0].name, "Org2");
});

test("PATCH /v1/staff/:id updates member", async () => {
  const app = createApp({ staffService: createInMemoryStaffService() });

  const createRes = await request(app)
    .post("/v1/staff")
    .set("Authorization", `Bearer ${makeToken("org-1")}`)
    .send({ name: "Bob", phone: "555-2000" } satisfies StaffCreateInput);

  const updateRes = await request(app)
    .patch(`/v1/staff/${createRes.body.id}`)
    .set("Authorization", `Bearer ${makeToken("org-1")}`)
    .send({ phone: "555-2001" } satisfies StaffUpdateInput);

  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.phone, "555-2001");
});

test("DELETE /v1/staff/:id removes member", async () => {
  const app = createApp({ staffService: createInMemoryStaffService() });

  const createRes = await request(app)
    .post("/v1/staff")
    .set("Authorization", `Bearer ${makeToken("org-1")}`)
    .send({ name: "Carol", phone: "555-3000" } satisfies StaffCreateInput);

  const deleteRes = await request(app)
    .delete(`/v1/staff/${createRes.body.id}`)
    .set("Authorization", `Bearer ${makeToken("org-1")}`);

  assert.equal(deleteRes.status, 204);
});

test("PATCH /v1/staff/:id returns 404 for cross-org access", async () => {
  const app = createApp({ staffService: createInMemoryStaffService() });

  const createRes = await request(app)
    .post("/v1/staff")
    .set("Authorization", `Bearer ${makeToken("org-1")}`)
    .send({ name: "Dave", phone: "555-4000" } satisfies StaffCreateInput);

  const updateRes = await request(app)
    .patch(`/v1/staff/${createRes.body.id}`)
    .set("Authorization", `Bearer ${makeToken("org-2")}`)
    .send({ phone: "555-4999" } satisfies StaffUpdateInput);

  assert.equal(updateRes.status, 404);
});

test("GET /v1/staff returns 403 for non-admin", async () => {
  const app = createApp({ staffService: createInMemoryStaffService() });
  const response = await request(app).get("/v1/staff").set("Authorization", `Bearer ${makeUserToken("org-1")}`);
  assert.equal(response.status, 403);
});

test("POST /v1/staff/:id/deactivate toggles active to false", async () => {
  const app = createApp({ staffService: createInMemoryStaffService() });

  const createRes = await request(app)
    .post("/v1/staff")
    .set("Authorization", `Bearer ${makeToken("org-1")}`)
    .send({ name: "Eve", phone: "555-5000" } satisfies StaffCreateInput);

  const deactivateRes = await request(app)
    .post(`/v1/staff/${createRes.body.id}/deactivate`)
    .set("Authorization", `Bearer ${makeToken("org-1")}`);

  assert.equal(deactivateRes.status, 200);
  assert.equal(deactivateRes.body.active, false);
});

test("POST /v1/staff/:id/activate toggles active to true", async () => {
  const app = createApp({ staffService: createInMemoryStaffService() });

  const createRes = await request(app)
    .post("/v1/staff")
    .set("Authorization", `Bearer ${makeToken("org-1")}`)
    .send({ name: "Frank", phone: "555-6000", active: false } satisfies StaffCreateInput);

  const activateRes = await request(app)
    .post(`/v1/staff/${createRes.body.id}/activate`)
    .set("Authorization", `Bearer ${makeToken("org-1")}`);

  assert.equal(activateRes.status, 200);
  assert.equal(activateRes.body.active, true);
});

