/**
 * Money lives in the DB as `limit_cents BIGINT`. The form takes PLN; these
 * helpers convert in both directions. Parsing is `Intl`-free so it stays
 * predictable on Workers; formatting uses `Intl` for the user-facing list.
 */

type ParseResult = { cents: number } | { error: string };

/**
 * Parse an optional-decimal PLN string (e.g. "1500", "1500.50") to integer
 * cents. Rejects non-numeric, negative, more-than-2-decimal, and non-positive
 * input. Accepts a comma as the decimal separator (PL keyboards).
 */
export function parsePlnToCents(input: string): ParseResult {
  const trimmed = input.trim().replace(",", ".");
  if (!trimmed) {
    return { error: "Limit is required" };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return { error: "Enter a valid amount in PLN (max 2 decimal places)" };
  }
  const cents = Math.round(Number(trimmed) * 100);
  if (!Number.isFinite(cents) || cents <= 0) {
    return { error: "Limit must be greater than zero" };
  }
  return { cents };
}

/** Format integer cents back to a PLN string for display, e.g. "1 500,00 zł". */
export function formatCentsToPln(cents: number): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
  }).format(cents / 100);
}
