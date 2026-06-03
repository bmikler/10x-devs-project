import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { getCurrentBudgetYear } from "@/lib/budget-year";
import { parsePlnToCents } from "@/lib/money";

function back(context: Parameters<APIRoute>[0], msg: string) {
  return context.redirect(`/expenses?error=${encodeURIComponent(msg)}`);
}

function todayInWarsaw(): string {
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
function warsawNoon(dateStr: string): string {
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

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return back(context, "Supabase is not configured");
  }

  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const form = await context.request.formData();
  const amountStr = ((form.get("amount") as string | null) ?? "").trim();
  const categoryId = ((form.get("category_id") as string | null) ?? "").trim();
  const nameRaw = ((form.get("name") as string | null) ?? "").trim();
  const dateStr = ((form.get("date") as string | null) ?? "").trim();

  // Validate amount.
  if (!amountStr) {
    return back(context, "Amount is required");
  }
  const parsed = parsePlnToCents(amountStr);
  if ("error" in parsed) {
    return back(context, parsed.error);
  }

  // Validate category_id — must belong to this user for the current year.
  // RLS enforces isolation, but an explicit lookup gives a user-friendly error.
  if (!categoryId) {
    return back(context, "Category is required");
  }
  const year = getCurrentBudgetYear();
  const { data: category, error: catError } = await supabase
    .from("categories")
    .select("id,name")
    .eq("id", categoryId)
    .eq("year", year)
    .single();
  if (catError) {
    return back(context, "Invalid or inaccessible category");
  }

  // Name: fallback to category name if the form field was left blank.
  const name = nameRaw || category.name;

  // Resolve and validate date.
  const resolvedDate = dateStr || todayInWarsaw();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(resolvedDate)) {
    return back(context, "Invalid date");
  }

  const expenseAt = warsawNoon(resolvedDate);

  const { error: insertError } = await supabase.from("expenses").insert({
    user_id: user.id,
    category_id: category.id,
    name,
    amount_cents: parsed.cents,
    expense_at: expenseAt,
  });
  if (insertError) {
    return back(context, insertError.message);
  }

  return context.redirect("/expenses?success=1");
};
