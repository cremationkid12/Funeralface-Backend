import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { createApp, type AppDependencies } from "../../src/app";
import type { FamilyTokenService } from "../../src/services/familyTokenService";
import { createPublicTokenRateLimit } from "../../src/middleware/publicTokenRateLimit";

function makeFamilyApp(overrides: Partial<AppDependencies> = {}) {
  return createApp(overrides);
}

test("GET /v1/public/assignments/by-token/:token returns 200 with sanitized view", async () => {
  const familyTokenService: FamilyTokenService = {
    async resolveByToken() {
      return {
        type: "ok",
        view: {
          assignment_id: "a1",
          decedent_name: "Jane Doe",
          status: "en_route",
          eta_note: "2026-03-25T12:00:00.000Z",
          support_contact_phone: "555-0100",
        },
      };
    },
  };

  const app = makeFamilyApp({ familyTokenService });
  const response = await request(app).get("/v1/public/assignments/by-token/secret-token-123");

  assert.equal(response.status, 200);
  assert.equal(response.body.assignment_id, "a1");
  assert.equal(response.body.decedent_name, "Jane Doe");
  assert.equal(response.body.support_contact_phone, "555-0100");
});

test("GET public token returns 404 when resolver reports not_found", async () => {
  const familyTokenService: FamilyTokenService = {
    async resolveByToken() {
      return { type: "not_found" };
    },
  };

  const app = makeFamilyApp({ familyTokenService });
  const response = await request(app).get("/v1/public/assignments/by-token/nope");

  assert.equal(response.status, 404);
  assert.equal(response.body.code, "not_found");
});

test("GET public token returns 410 when resolver reports expired", async () => {
  const familyTokenService: FamilyTokenService = {
    async resolveByToken() {
      return { type: "expired" };
    },
  };

  const app = makeFamilyApp({ familyTokenService });
  const response = await request(app).get("/v1/public/assignments/by-token/expired");

  assert.equal(response.status, 410);
  assert.equal(response.body.code, "token_expired");
});

test("GET public token returns 404 for whitespace-only token", async () => {
  let called = false;
  const familyTokenService: FamilyTokenService = {
    async resolveByToken() {
      called = true;
      return { type: "not_found" };
    },
  };

  const app = makeFamilyApp({ familyTokenService });
  const response = await request(app).get("/v1/public/assignments/by-token/%20");

  assert.equal(response.status, 404);
  assert.equal(called, false);
});

test("GET public token is rate limited", async () => {
  const familyTokenService: FamilyTokenService = {
    async resolveByToken() {
      return {
        type: "ok",
        view: {
          assignment_id: "a1",
          decedent_name: "X",
          status: "pending",
          eta_note: null,
          support_contact_phone: "",
        },
      };
    },
  };

  const publicTokenRateLimit = createPublicTokenRateLimit({ windowMs: 60_000, max: 2 });
  const app = makeFamilyApp({ familyTokenService, publicTokenRateLimit });

  await request(app).get("/v1/public/assignments/by-token/t1").expect(200);
  await request(app).get("/v1/public/assignments/by-token/t2").expect(200);
  const third = await request(app).get("/v1/public/assignments/by-token/t3");

  assert.equal(third.status, 429);
  assert.equal(third.body.code, "rate_limited");
});
