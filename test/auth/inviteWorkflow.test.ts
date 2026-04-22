import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createApp } from "../../src/app";

const JWT_SECRET = "test-secret-invite-workflow";

function tokenWithEmail(email: string) {
  return jwt.sign({ sub: "user-1", role: "user", org_id: "org-1", email }, JWT_SECRET);
}

test("GET /v1/public/invites/:token/preview returns invite preview", async () => {
  const app = createApp({
    staffInviteService: {
      async createAndSend() {},
      async previewByToken(token: string) {
        assert.equal(token, "invite-token-123");
        return {
          org_id: "org-1",
          invited_email: "member@example.com",
          invited_role: "user",
          inviter_name: "Admin User",
          inviter_email: "admin@example.com",
          expires_at: new Date().toISOString(),
        };
      },
      async acceptByToken() {
        return null;
      },
    },
  });

  const response = await request(app).get("/v1/public/invites/invite-token-123/preview");
  assert.equal(response.status, 200);
  assert.equal(response.body.invited_email, "member@example.com");
});

test("POST /v1/auth/invites/accept accepts invite for authenticated user", async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const app = createApp({
    staffInviteService: {
      async createAndSend() {},
      async previewByToken() {
        return null;
      },
      async acceptByToken(input) {
        assert.equal(input.userId, "user-1");
        assert.equal(input.userEmail, "member@example.com");
        assert.equal(input.token, "invite-token-abc");
        return { org_id: "org-2", role: "user" };
      },
    },
  });

  const response = await request(app)
    .post("/v1/auth/invites/accept")
    .set("Authorization", `Bearer ${tokenWithEmail("member@example.com")}`)
    .send({ invite_token: "invite-token-abc" });

  assert.equal(response.status, 200);
  assert.equal(response.body.org_id, "org-2");
  assert.equal(response.body.role, "user");
});
