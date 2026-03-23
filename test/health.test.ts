import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { createApp } from "../src/app";

test("GET /v1/health returns service health payload", async () => {
  const app = createApp();
  const response = await request(app).get("/v1/health");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: "ok" });
});
