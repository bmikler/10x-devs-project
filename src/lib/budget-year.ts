/**
 * First day of the month after `currentMonth` (exclusive upper bound for the
 * yearly expense query). December wraps to `${year + 1}-01-01`.
 */
export function getExpenseCutoff(year: number, currentMonth: number): string {
  return currentMonth < 12 ? `${year}-${String(currentMonth + 1).padStart(2, "0")}-01` : `${year + 1}-01-01`;
}

/**
 * Single source of "the current budget year", derived in `Europe/Warsaw`.
 *
 * Cloudflare Workers run in UTC, so `new Date().getFullYear()` is wrong near a
 * year boundary (e.g. 23:30 Warsaw on Dec 31 is still 22:30 UTC — same year —
 * but at 00:30 Warsaw on Jan 1 it is 23:30 UTC on Dec 31, the *previous* year).
 * `Intl.DateTimeFormat` with an explicit `timeZone` sidesteps the host clock.
 */
export function getCurrentBudgetYear(): number {
  const year = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
  }).format(new Date());
  return Number(year);
}
