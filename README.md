# Funeralface Backend

TypeScript Express API for Funeralface. Contract: `openapi.yaml`.

## Setup

1. Copy `.env.example` to `.env` and fill values.
2. Install: `npm ci`
3. Build: `npm run build`
4. Run migrations: `npm run db:migrate` (requires `DATABASE_URL`)
5. Dev server: `npm run dev` (default port **8010**)

## Tests

```bash
npm test
```

## Staff invites (SendGrid)

Invites from `POST /v1/staff/invite` use **Supabase Auth** `inviteUserByEmail`. Supabase sends the message, so **outbound mail is configured in the Supabase project**, not via new variables in this repo.

### SendGrid

1. In [SendGrid](https://sendgrid.com/), create an **API key** with Mail Send permission.
2. Complete **Sender Authentication** (recommended: **domain**; minimum: **Single Sender Verification**) so your “from” address is allowed.
3. In [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Project Settings** → **Authentication** → **SMTP Settings**:
   - Enable **custom SMTP**
   - **Host:** `smtp.sendgrid.net`
   - **Port:** `587`
   - **Username:** `apikey` (literal string)
   - **Password:** your SendGrid API key
   - **Sender email / name:** must match a verified sender in SendGrid

4. Save. Optional: under **Authentication** → **Email Templates**, customize the **Invite user** template.

### This API (Railway, etc.)

Keep **`SUPABASE_URL`** and **`SUPABASE_SERVICE_ROLE_KEY`** set. No SendGrid secrets are required in this service unless you later add direct SendGrid API calls.

Official references: [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [SendGrid SMTP](https://docs.sendgrid.com/for-developers/sending-email/getting-started-smtp).

## Deploy (Railway)

Uses `Dockerfile` and `railway.toml`. Set the same env vars as production (especially `DATABASE_URL`, `JWT_SECRET`, Supabase keys). Run `npm run db:migrate` against the production database before or after first deploy.
