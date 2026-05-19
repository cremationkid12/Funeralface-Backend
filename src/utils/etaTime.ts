/**
 * ETA is stored as TIMESTAMPTZ (absolute instant). Clients send ISO-8601 with a timezone
 * offset (e.g. 19:30 in UTC+9 → `2026-05-18T19:30:00+09:00` → DB `10:30:00+00`).
 */

const HHMM_PATTERN = /^(\d{1,2}):(\d{2})$/;

function logEtaDebug(event: string, details: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") return;
  console.info(
    "[AssignmentEta]",
    event,
    JSON.stringify({
      server_now: new Date().toISOString(),
      server_tz_offset_min: -new Date().getTimezoneOffset(),
      ...details,
    }),
  );
}

function toDate(value: Date | string): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Parse request `eta_time`.
 * - Preferred: full ISO-8601 string (with `Z` or numeric offset).
 * - Legacy `HH:mm` only: interpreted in the server's local timezone (avoid in new clients).
 */
export function parseEtaTimeFromBody(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const hhmm = HHMM_PATTERN.exec(trimmed);
  if (hhmm) {
    const hours = Number(hhmm[1]);
    const minutes = Number(hhmm[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return undefined;
    const now = new Date();
    const date = new Date(now);
    date.setHours(hours, minutes, 0, 0);
    logEtaDebug("parse_body_hhmm", {
      input: trimmed,
      stored_utc_iso: date.toISOString(),
    });
    return date;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  logEtaDebug("parse_body_iso", {
    input: trimmed,
    stored_utc_iso: parsed.toISOString(),
  });
  return parsed;
}

/** UTC ISO string for API responses (`2026-05-18T10:30:00.000Z`). */
export function serializeAssignmentEtaTime(
  eta: Date | string | null | undefined,
): string | null {
  const date = eta == null ? null : toDate(eta);
  if (!date) return null;
  const iso = date.toISOString();
  logEtaDebug("serialize_api", { stored_utc_iso: iso });
  return iso;
}
