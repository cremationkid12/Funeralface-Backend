import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createApp } from "../../src/app";

const JWT_SECRET = "test-secret-invite";

function adminToken() {
  return jwt.sign({ sub: "admin-1", role: "admin", org_id: "org-1" }, JWT_SECRET);
}

function userToken() {
  return jwt.sign({ sub: "user-1", role: "user", org_id: "org-1" }, JWT_SECRET);
}

test("POST /v1/staff/invite returns 401 without token", async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const app = createApp();
  const response = await request(app).post("/v1/staff/invite").send({ email: "a@b.com" });

  assert.equal(response.status, 401);
});

test("POST /v1/staff/invite returns 403 for non-admin", async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const app = createApp();
  const response = await request(app)
    .post("/v1/staff/invite")
    .set("Authorization", `Bearer ${userToken()}`)
    .send({ email: "staff@example.com" });

  assert.equal(response.status, 403);
  assert.equal(response.body.code, "forbidden");
});

test("POST /v1/staff/invite returns 400 for invalid email", async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const app = createApp();
  const response = await request(app)
    .post("/v1/staff/invite")
    .set("Authorization", `Bearer ${adminToken()}`)
    .send({ email: "not-an-email" });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "bad_request");
});

test("POST /v1/staff/invite returns 202 when invite succeeds", async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const app = createApp({
    inviteUserByEmail: async (email: string) => {
      assert.equal(email, "staff@example.com");
    },
  });

  const response = await request(app)
    .post("/v1/staff/invite")
    .set("Authorization", `Bearer ${adminToken()}`)
    .send({ email: "staff@example.com" });

  assert.equal(response.status, 202);
  assert.deepEqual(response.body, {
    status: "invited",
    email: "staff@example.com",
    org_id: "org-1",
  });
});

test("POST /v1/staff/invite returns 502 when provider fails", async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const app = createApp({
    inviteUserByEmail: async () => {
      throw new Error("duplicate user");
    },
  });

  const response = await request(app)
    .post("/v1/staff/invite")
    .set("Authorization", `Bearer ${adminToken()}`)
    .send({ email: "staff@example.com" });

  assert.equal(response.status, 502);
  assert.equal(response.body.code, "invite_failed");
});

test("POST /v1/staff/invite returns 503 when Supabase not configured", async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const app = createApp();
  const response = await request(app)
    .post("/v1/staff/invite")
    .set("Authorization", `Bearer ${adminToken()}`)
    .send({ email: "staff@example.com" });

  assert.equal(response.status, 503);
  assert.equal(response.body.code, "service_unavailable");
});
