import { parsePlnToCents } from "@/lib/money";

export function todayInWarsaw(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Construct a TIMESTAMPTZ ISO string for noon Warsaw time on the given date.
 * Storing at noon avoids date-boundary ambiguity when the value is later
 * extracted with AT TIME ZONE 'Europe/Warsaw' in report queries.
 */
export function warsawNoon(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Probe UTC noon to determine Warsaw's UTC offset at that date (handles DST).
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  const warsawHour = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Europe/Warsaw",
      hour: "2-digit",
      hour12: false,
    })
      .formatToParts(probe)
      .find((p) => p.type === "hour")?.value ?? "12",
  );
  // offset = warsawHour - 12; Warsaw noon = UTC (12 - offset)
  return new Date(Date.UTC(y, m - 1, d, 12 - (warsawHour - 12))).toISOString();
}

export interface ValidatedExpense {
  amountCents: number;
  name: string | null;
  dateStr: string;
  expenseAt: string;
  categoryId: string;
}

export interface ExpenseValidationError {
  error: string;
}

export function validateExpenseFields(form: FormData): ExpenseValidationError | Omit<ValidatedExpense, "name"> {
  const amountStr = ((form.get("amount") as string | null) ?? "").trim();
  const categoryId = ((form.get("category_id") as string | null) ?? "").trim();
  const dateStr = ((form.get("date") as string | null) ?? "").trim();

  if (!amountStr) {
    return { error: "Amount is required" };
  }
  const parsed = parsePlnToCents(amountStr);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  if (!categoryId) {
    return { error: "Category is required" };
  }

  const resolvedDate = dateStr || todayInWarsaw();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(resolvedDate)) {
    return { error: "Invalid date" };
  }
  const dateCheck = new Date(resolvedDate);
  if (isNaN(dateCheck.getTime())) {
    return { error: "Invalid date" };
  }
  if (resolvedDate > todayInWarsaw()) {
    return { error: "Date cannot be in the future" };
  }

  return {
    amountCents: parsed.cents,
    categoryId,
    dateStr: resolvedDate,
    expenseAt: warsawNoon(resolvedDate),
  };
}
