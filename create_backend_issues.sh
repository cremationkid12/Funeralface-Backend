#!/usr/bin/env bash
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required."
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <owner/repo>"
  echo "Example: $0 your-org/funeralface-api"
  exit 1
fi

REPO="$1"

echo "Creating backend issues in $REPO..."

gh issue create -R "$REPO" \
  --title "[Backend] Define REST v1 contract + enforce OpenAPI in CI" \
  --label "backend,api-contract,testing" \
  --body "$(cat <<'EOF'
## Description
Create `openapi.yaml` as the single source of truth for mobile and backend integration. Add CI checks to block schema drift and invalid contracts.

## Scope
- Add `openapi.yaml` with `/v1` namespace.
- Define core schemas: `Settings`, `StaffMember`, `PickupAssignment`, `ErrorResponse`.
- Define public family token endpoint schema.
- Add OpenAPI lint/validation in CI.
- Add versioning/deprecation notes for REST evolution.

## Tasks
- [ ] Add initial `openapi.yaml`.
- [ ] Add request/response examples for all v1 resources.
- [ ] Add CI job for contract validation (Spectral/openapi-cli).
- [ ] Add changelog policy for contract changes.

## Test Checklist
- [ ] CI fails when OpenAPI is invalid.
- [ ] CI fails on schema lint violations.
- [ ] Example payloads pass schema validation.

## Acceptance Criteria (DoD)
- OpenAPI contract is merged and enforced in CI.
- API contract changes require passing validation.
- Mobile team can implement client models from this file.
EOF
)"

gh issue create -R "$REPO" \
  --title "[Backend] Create PostgreSQL schema + migrations (Supabase)" \
  --label "backend,testing" \
  --body "$(cat <<'EOF'
## Description
Implement reproducible schema and migration flow for Supabase PostgreSQL aligned with v1 contract.

## Scope
- Create tables for `settings`, `staff_members`, `pickup_assignments`, and audit support.
- Add keys, constraints, timestamps, and indexes.
- Add migration scripts and CI migration verification.

## Tasks
- [ ] Set up migration tool/scripts.
- [ ] Create initial schema migration.
- [ ] Add indexes and status constraints.
- [ ] Add seed data for tests/staging smoke checks.
- [ ] Document migration workflow.

## Test Checklist
- [ ] Fresh DB migrate-up succeeds in CI.
- [ ] Re-running migrations is safe/idempotent.
- [ ] Invalid inserts violate constraints as expected.

## Acceptance Criteria (DoD)
- Schema is reproducible from empty DB.
- Migrations run cleanly in CI and staging.
- DB models align with OpenAPI schemas.
EOF
)"

gh issue create -R "$REPO" \
  --title "[Backend] Auth middleware + org scoping + secure staff invite" \
  --label "backend,security,testing" \
  --body "$(cat <<'EOF'
## Description
Implement JWT-based auth and authorization with organization scoping. Replace Base44-style invite flow using server-side Supabase Admin invite endpoint.

## Scope
- Auth middleware for protected routes.
- Org-level authorization checks.
- REST endpoint for staff invites with role checks.
- Standardized auth error responses.

## Tasks
- [ ] Implement JWT verification middleware.
- [ ] Attach user/org context per request.
- [ ] Add `POST /v1/staff/invite`.
- [ ] Enforce inviter role permissions.
- [ ] Add auth error model in OpenAPI.

## Test Checklist
- [ ] Missing/invalid JWT -> `401`.
- [ ] Valid JWT without org access -> `403`.
- [ ] Authorized inviter can invite staff.
- [ ] Unauthorized role cannot invite.

## Acceptance Criteria (DoD)
- All protected endpoints enforce auth middleware.
- Staff invite is server-mediated and secure.
- Security and auth integration tests pass.
EOF
)"

gh issue create -R "$REPO" \
  --title "[Backend] Implement Settings REST endpoints" \
  --label "backend,testing" \
  --body "$(cat <<'EOF'
## Description
Implement settings retrieval/update endpoints replacing Base44 `Settings` usage.

## Scope
- `GET /v1/settings`
- `PATCH /v1/settings`
- Validation and org scoping
- Response consistency with OpenAPI

## Tasks
- [ ] Implement settings service and handlers.
- [ ] Add payload validation.
- [ ] Wire persistence with org scoping.
- [ ] Add OpenAPI examples and error responses.

## Test Checklist
- [ ] Get default/empty settings works.
- [ ] Patch updates only allowed fields.
- [ ] Unauthorized access blocked.
- [ ] Responses match OpenAPI schema.

## Acceptance Criteria (DoD)
- Mobile settings flow can use REST only.
- Endpoint behavior is fully covered by integration tests.
EOF
)"

gh issue create -R "$REPO" \
  --title "[Backend] Implement Staff REST endpoints" \
  --label "backend,testing" \
  --body "$(cat <<'EOF'
## Description
Implement staff CRUD endpoints with sorting and pagination for mobile parity.

## Scope
- `GET /v1/staff`
- `POST /v1/staff`
- `PATCH /v1/staff/:id`
- `DELETE /v1/staff/:id`
- Sort/pagination behavior

## Tasks
- [ ] Add staff CRUD handlers/services.
- [ ] Add query params for list sorting/pagination.
- [ ] Enforce org/role authorization.
- [ ] Document response shape in OpenAPI.

## Test Checklist
- [ ] CRUD happy path passes with auth.
- [ ] Cross-org access is denied.
- [ ] Pagination and sorting are deterministic.
- [ ] Delete behavior matches agreed policy.

## Acceptance Criteria (DoD)
- Staff mobile screens can be powered end-to-end by REST.
- Contract + integration tests pass.
EOF
)"

gh issue create -R "$REPO" \
  --title "[Backend] Implement Assignments REST + status transition audit logging" \
  --label "backend,testing" \
  --body "$(cat <<'EOF'
## Description
Implement assignment endpoints and status transition logging to replace Base44 assignment and transport update flows.

## Scope
- `GET /v1/assignments`
- `POST /v1/assignments`
- `PATCH /v1/assignments/:id`
- Status transition rules + audit records

## Tasks
- [ ] Implement assignment CRUD and list filters/sort.
- [ ] Enforce status transition validation.
- [ ] Add audit log write on status change.
- [ ] Expose schema/contracts in OpenAPI.

## Test Checklist
- [ ] Create/list/update assignment flows pass.
- [ ] Invalid status transitions are rejected.
- [ ] Audit record is created on valid status change.
- [ ] Contract schema checks pass.

## Acceptance Criteria (DoD)
- Assignment and dashboard data needs are fully covered.
- Audit trail exists for transport/status updates.
EOF
)"

gh issue create -R "$REPO" \
  --title "[Backend] Family token API with strict validation + abuse protection" \
  --label "backend,security,testing" \
  --body "$(cat <<'EOF'
## Description
Provide a secure public endpoint for family token flow used by verified deep links. Token validation must be server-side with minimal data exposure.

## Scope
- Public endpoint for token resolution.
- Token expiry/revocation handling.
- Sanitized response only.
- Rate limiting and safe error behavior.
- No raw token values in logs.

## Tasks
- [ ] Implement token resolution endpoint.
- [ ] Add token hash storage/lookup policy.
- [ ] Enforce TTL and revocation checks.
- [ ] Add rate limiting and abuse controls.
- [ ] Add logging redaction for token values.

## Test Checklist
- [ ] Valid token returns sanitized payload.
- [ ] Invalid/expired/revoked token rejected consistently.
- [ ] Replay blocked per policy.
- [ ] Burst requests hit `429`.
- [ ] Logs do not expose raw tokens.

## Acceptance Criteria (DoD)
- Public family token flow is production-safe.
- Security tests for misuse and leakage are green.
EOF
)"

echo "Done. Backend issues created in $REPO."
