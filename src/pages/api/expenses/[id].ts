import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { getCurrentBudgetYear } from "@/lib/budget-year";
import { validateExpenseFields } from "@/lib/expense-write";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/report?view=monthly&error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const id = context.params.id ?? "";
  const form = await context.request.formData();
  const intent = ((form.get("intent") as string | null) ?? "").trim();

  if (intent === "delete") {
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) {
      return context.redirect(`/report?view=monthly&error=${encodeURIComponent(error.message)}`);
    }
    return context.redirect("/report?view=monthly&success=deleted");
  }

  // Update branch
  const nameRaw = ((form.get("name") as string | null) ?? "").trim();

  const validated = validateExpenseFields(form);
  if ("error" in validated) {
    return context.redirect(`/expenses/${id}/edit?error=${encodeURIComponent(validated.error)}`);
  }

  const { amountCents, categoryId, expenseAt } = validated;

  // Explicit category ownership lookup for a friendly error.
  const year = getCurrentBudgetYear();
  const { data: category, error: catError } = await supabase
    .from("categories")
    .select("id,name")
    .eq("id", categoryId)
    .eq("year", year)
    .single();
  if (catError) {
    return context.redirect(`/expenses/${id}/edit?error=${encodeURIComponent("Invalid or inaccessible category")}`);
  }

  const name = nameRaw || category.name;

  const { error: updateError } = await supabase
    .from("expenses")
    .update({ category_id: category.id, name, amount_cents: amountCents, expense_at: expenseAt })
    .eq("id", id);
  if (updateError) {
    return context.redirect(`/expenses/${id}/edit?error=${encodeURIComponent(updateError.message)}`);
  }

  return context.redirect("/report?view=monthly&success=updated");
};
