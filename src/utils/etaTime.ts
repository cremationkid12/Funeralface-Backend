/**
 * ETA is stored as TIMESTAMPTZ (absolute instant).
 * Clients must send UTC ISO (`...Z`) or ISO with numeric offset — not bare local datetime.
 */

const HHMM_PATTERN = /^(\d{1,2}):(\d{2})$/;
const HAS_TIMEZONE = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;

function toDate(value: Date | string): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Parse request `eta_time`.
 * - Required: ISO-8601 with `Z` or `±HH:mm` offset (from mobile `toUtc().toIso8601String()`).
 * - Legacy `HH:mm` only: rejected (return undefined) — forces timezone-safe payloads.
 */
export function parseEtaTimeFromBody(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (HHMM_PATTERN.test(trimmed)) {
    return undefined;
  }

  if (!HAS_TIMEZONE.test(trimmed)) {
    return undefined;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

/** UTC ISO string for API responses. */
export function serializeAssignmentEtaTime(
  eta: Date | string | null | undefined,
): string | null {
  const date = eta == null ? null : toDate(eta);
  if (!date) return null;
  return date.toISOString();
}
