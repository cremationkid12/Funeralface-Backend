import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createApp } from "../../src/app";

const JWT_SECRET = "test-secret";

test.before(() => {
  process.env.JWT_SECRET = JWT_SECRET;
});

test("GET /v1/auth/me returns 503 when JWT_SECRET missing", async () => {
  const prev = process.env.JWT_SECRET;
  try {
    delete process.env.JWT_SECRET;
    const app = createApp();

    const token = jwt.sign(
      {
        sub: "user-1",
        role: "admin",
        org_id: "org-1",
      },
      JWT_SECRET,
    );

    const response = await request(app)
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    assert.equal(response.status, 503);
    assert.equal(response.body.code, "auth_not_configured");
  } finally {
    if (prev !== undefined) {
      process.env.JWT_SECRET = prev;
    } else {
      delete process.env.JWT_SECRET;
    }
  }
});

test("GET /v1/auth/me returns 401 without token", async () => {
  const app = createApp();
  const response = await request(app).get("/v1/auth/me");

  assert.equal(response.status, 401);
  assert.equal(response.body.code, "unauthorized");
});

test("GET /v1/auth/me returns user context with valid token", async () => {
  const app = createApp();
  const token = jwt.sign(
    {
      sub: "user-1",
      role: "admin",
      org_id: "org-1",
    },
    JWT_SECRET,
  );

  const response = await request(app)
    .get("/v1/auth/me")
    .set("Authorization", `Bearer ${token}`);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    user_id: "user-1",
    role: "admin",
    org_id: "org-1",
  });
});
