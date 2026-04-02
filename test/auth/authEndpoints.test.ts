import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { createApp } from "../../src/app";
import type { AuthService } from "../../src/services/authService";

const fakeAuthService: AuthService = {
  async register(email, _password) {
    return {
      user_id: `u-${email}`,
      access_token: "at-register",
      refresh_token: "rt-register",
    };
  },
  async login(email, _password) {
    return {
      user_id: `u-${email}`,
      access_token: "at-login",
      refresh_token: "rt-login",
    };
  },
  async refresh(_refreshToken) {
    return {
      user_id: "u-refresh",
      access_token: "at-refresh",
      refresh_token: "rt-refresh",
    };
  },
  async logout(_accessToken) {},
};

test("POST /v1/auth/register validates body", async () => {
  const app = createApp({ authService: fakeAuthService });
  const res = await request(app).post("/v1/auth/register").send({ email: "x", password: "123" });
  assert.equal(res.status, 400);
});

test("POST /v1/auth/register returns session payload", async () => {
  const app = createApp({ authService: fakeAuthService });
  const res = await request(app)
    .post("/v1/auth/register")
    .send({ email: "user@example.com", password: "password123" });
  assert.equal(res.status, 201);
  assert.equal(res.body.access_token, "at-register");
});

test("POST /v1/auth/login returns session payload", async () => {
  const app = createApp({ authService: fakeAuthService });
  const res = await request(app)
    .post("/v1/auth/login")
    .send({ email: "user@example.com", password: "password123" });
  assert.equal(res.status, 200);
  assert.equal(res.body.access_token, "at-login");
});

test("POST /v1/auth/refresh returns new tokens", async () => {
  const app = createApp({ authService: fakeAuthService });
  const res = await request(app).post("/v1/auth/refresh").send({ refresh_token: "rt-login" });
  assert.equal(res.status, 200);
  assert.equal(res.body.access_token, "at-refresh");
});

test("POST /v1/auth/logout returns 204", async () => {
  const app = createApp({ authService: fakeAuthService });
  const res = await request(app).post("/v1/auth/logout").send({ access_token: "at-login" });
  assert.equal(res.status, 204);
});
