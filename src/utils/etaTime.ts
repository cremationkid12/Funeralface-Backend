/** ETA helpers: TIMESTAMPTZ in DB, ISO-8601 with timezone on the wire. */

const HHMM_PATTERN = /^(\d{1,2}):(\d{2})$/;
const HAS_TIMEZONE = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;

function toDate(value: Date | string): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Parse request `eta_time` (ISO with `Z` or numeric offset only). */
export function parseEtaTimeFromBody(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (HHMM_PATTERN.test(trimmed) || !HAS_TIMEZONE.test(trimmed)) {
    return undefined;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

export function serializeAssignmentEtaTime(
  eta: Date | string | null | undefined,
): string | null {
  const date = eta == null ? null : toDate(eta);
  if (!date) return null;
  return date.toISOString();
}
