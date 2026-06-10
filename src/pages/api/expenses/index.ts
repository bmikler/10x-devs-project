import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { getCurrentBudgetYear } from "@/lib/budget-year";
import { validateExpenseFields } from "@/lib/expense-write";

function back(context: Parameters<APIRoute>[0], msg: string) {
  return context.redirect(`/expenses?error=${encodeURIComponent(msg)}`);
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
  const nameRaw = ((form.get("name") as string | null) ?? "").trim();

  const validated = validateExpenseFields(form);
  if ("error" in validated) {
    return back(context, validated.error);
  }

  const { amountCents, categoryId, expenseAt } = validated;

  // Validate category_id — must belong to this user for the current year.
  // RLS enforces isolation, but an explicit lookup gives a user-friendly error.
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

  const { error: insertError } = await supabase.from("expenses").insert({
    user_id: user.id,
    category_id: category.id,
    name,
    amount_cents: amountCents,
    expense_at: expenseAt,
  });
  if (insertError) {
    return back(context, insertError.message);
  }

  return context.redirect("/expenses?success=1");
};
