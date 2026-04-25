import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createApp } from "../../src/app";
import {
  type AssignmentCreateInput,
  type AssignmentService,
  type AssignmentStatus,
  type AssignmentUpdateInput,
  type PickupAssignmentRecord,
} from "../../src/services/assignmentService";

const JWT_SECRET = "test-secret-assignments";

type AuditEntry = {
  assignmentId: string;
  orgId: string;
  fromStatus: AssignmentStatus;
  toStatus: AssignmentStatus;
  actorUserId: string;
};

function makeToken(orgId: string, userId = "user-1"): string {
  return jwt.sign({ sub: userId, role: "admin", org_id: orgId }, JWT_SECRET);
}

function createInMemoryAssignmentService() {
  const data = new Map<string, PickupAssignmentRecord[]>();
  const audits: AuditEntry[] = [];
  let counter = 1;

  const listFor = (orgId: string) => data.get(orgId) ?? [];

  const service: AssignmentService = {
    async listByOrgId(orgId, sort) {
      const items = [...listFor(orgId)];
      if (sort === "-created_at") return items.reverse();
      return items;
    },

    async createByOrgId(orgId, input) {
      const item: PickupAssignmentRecord = {
        id: `assignment-${counter++}`,
        org_id: orgId,
        decedent_name: input.decedent_name,
        pickup_address: input.pickup_address,
        contact_name: input.contact_name,
        contact_phone: input.contact_phone,
        notes: input.notes ?? null,
        assigned_staff_id: input.assigned_staff_id ?? null,
        status: (input.status ?? "pending") as AssignmentStatus,
      };
      data.set(orgId, [...listFor(orgId), item]);
      return item;
    },

    async updateByOrgIdAndId(orgId, id, input, actorUserId) {
      const items = listFor(orgId);
      const idx = items.findIndex((i) => i.id === id);
      if (idx < 0) return null;

      const current = items[idx];
      const nextStatus = (input.status ?? current.status) as AssignmentStatus;

      const next: PickupAssignmentRecord = {
        ...current,
        ...input,
        status: nextStatus,
      };
      const arr = [...items];
      arr[idx] = next;
      data.set(orgId, arr);

      if (current.status !== next.status) {
        audits.push({
          assignmentId: id,
          orgId,
          fromStatus: current.status,
          toStatus: next.status,
          actorUserId,
        });
      }

      return next;
    },
  };

  return { service, audits };
}

test.before(() => {
  process.env.JWT_SECRET = JWT_SECRET;
});

test("GET /v1/assignments returns 401 without token", async () => {
  const { service } = createInMemoryAssignmentService();
  const app = createApp({ assignmentService: service });
  const response = await request(app).get("/v1/assignments");
  assert.equal(response.status, 401);
});

test("POST /v1/assignments creates assignment", async () => {
  const { service } = createInMemoryAssignmentService();
  const app = createApp({ assignmentService: service });
  const response = await request(app)
    .post("/v1/assignments")
    .set("Authorization", `Bearer ${makeToken("org-1")}`)
    .send({
      decedent_name: "John Doe",
      pickup_address: "123 Main St",
      contact_name: "Jane Doe",
      contact_phone: "555-1111",
    } satisfies AssignmentCreateInput);

  assert.equal(response.status, 201);
  assert.equal(response.body.org_id, "org-1");
  assert.equal(response.body.status, "pending");
});

test("GET /v1/assignments is org-scoped", async () => {
  const { service } = createInMemoryAssignmentService();
  const app = createApp({ assignmentService: service });

  await request(app)
    .post("/v1/assignments")
    .set("Authorization", `Bearer ${makeToken("org-1")}`)
    .send({
      decedent_name: "Org1",
      pickup_address: "A",
      contact_name: "C1",
      contact_phone: "1",
    } satisfies AssignmentCreateInput);
  await request(app)
    .post("/v1/assignments")
    .set("Authorization", `Bearer ${makeToken("org-2")}`)
    .send({
      decedent_name: "Org2",
      pickup_address: "B",
      contact_name: "C2",
      contact_phone: "2",
    } satisfies AssignmentCreateInput);

  const org1 = await request(app).get("/v1/assignments").set("Authorization", `Bearer ${makeToken("org-1")}`);
  const org2 = await request(app).get("/v1/assignments").set("Authorization", `Bearer ${makeToken("org-2")}`);

  assert.equal(org1.status, 200);
  assert.equal(org2.status, 200);
  assert.equal(org1.body.items.length, 1);
  assert.equal(org2.body.items.length, 1);
  assert.equal(org1.body.items[0].decedent_name, "Org1");
  assert.equal(org2.body.items[0].decedent_name, "Org2");
});

test("PATCH /v1/assignments/:id updates status and creates audit log", async () => {
  const { service, audits } = createInMemoryAssignmentService();
  const app = createApp({ assignmentService: service });

  const created = await request(app)
    .post("/v1/assignments")
    .set("Authorization", `Bearer ${makeToken("org-1", "actor-1")}`)
    .send({
      decedent_name: "Status Flow",
      pickup_address: "X",
      contact_name: "Y",
      contact_phone: "Z",
      status: "completed",
    } satisfies AssignmentCreateInput);

  const update = await request(app)
    .patch(`/v1/assignments/${created.body.id}`)
    .set("Authorization", `Bearer ${makeToken("org-1", "actor-1")}`)
    .send({ status: "pending" } satisfies AssignmentUpdateInput);

  assert.equal(update.status, 200);
  assert.equal(update.body.status, "pending");
  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.fromStatus, "completed");
  assert.equal(audits[0]?.toStatus, "pending");
});

test("PATCH /v1/assignments/:id 404 for cross-org assignment", async () => {
  const { service } = createInMemoryAssignmentService();
  const app = createApp({ assignmentService: service });

  const created = await request(app)
    .post("/v1/assignments")
    .set("Authorization", `Bearer ${makeToken("org-1")}`)
    .send({
      decedent_name: "Cross Org",
      pickup_address: "Addr",
      contact_name: "Contact",
      contact_phone: "Phone",
    } satisfies AssignmentCreateInput);

  const update = await request(app)
    .patch(`/v1/assignments/${created.body.id}`)
    .set("Authorization", `Bearer ${makeToken("org-2")}`)
    .send({ status: "assigned" } satisfies AssignmentUpdateInput);

  assert.equal(update.status, 404);
});

