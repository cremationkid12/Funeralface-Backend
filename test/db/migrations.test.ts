import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { newDb } from "pg-mem";
import type { Client } from "pg";
import { runMigrations } from "../../src/db/migrate";

function createInMemoryPgClient(): Client {
  const db = newDb();
  const adapter = db.adapters.createPg();
  return new adapter.Client();
}

test("migrations create core tables", async () => {
  const client = createInMemoryPgClient();
  await client.connect();

  try {
    await runMigrations(client, path.resolve(process.cwd(), "db", "migrations"));

    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    const tableNames = result.rows.map((row) => row.table_name);
    assert.deepEqual(tableNames, [
      "assignment_audit_logs",
      "pickup_assignments",
      "settings",
      "staff_members",
    ]);
  } finally {
    await client.end();
  }
});

test("pickup_assignments enforces status constraint", async () => {
  const client = createInMemoryPgClient();
  await client.connect();

  try {
    await runMigrations(client, path.resolve(process.cwd(), "db", "migrations"));

    await assert.rejects(
      () =>
        client.query(
          `
          INSERT INTO pickup_assignments (
            id,
            org_id,
            decedent_name,
            pickup_address,
            contact_name,
            contact_phone,
            status
          ) VALUES (
            'asgn-1',
            'org-1',
            'John Doe',
            '123 Main St',
            'Jane Doe',
            '555-1111',
            'invalid_status'
          );
          `,
        ),
    );
  } finally {
    await client.end();
  }
});
