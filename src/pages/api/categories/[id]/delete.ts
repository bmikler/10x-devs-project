import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { getCurrentBudgetYear } from "@/lib/budget-year";

function back(context: Parameters<APIRoute>[0], msg: string) {
  return context.redirect(`/categories?error=${encodeURIComponent(msg)}`);
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

  const id = context.params.id;
  if (!id) {
    return back(context, "Category not found");
  }

  const year = getCurrentBudgetYear();

  const { data: existing, error: fetchError } = await supabase
    .from("categories")
    .select("id,is_system")
    .eq("id", id)
    .eq("year", year)
    .maybeSingle();

  if (fetchError || !existing) {
    return back(context, "Category not found");
  }
  if (existing.is_system) {
    return back(context, `The "other" category cannot be deleted`);
  }

  const { error: deleteError } = await supabase.from("categories").delete().eq("id", id);

  if (deleteError) {
    return back(context, deleteError.message);
  }

  return context.redirect("/categories");
};
