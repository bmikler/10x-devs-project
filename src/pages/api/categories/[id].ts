import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { getCurrentBudgetYear } from "@/lib/budget-year";
import { parsePlnToCents } from "@/lib/money";
import { CATEGORY_TYPES, SYSTEM_OTHER_NAME, type CategoryType } from "@/lib/categories";

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

  const form = await context.request.formData();
  const name = ((form.get("name") as string | null) ?? "").trim();
  const type = (form.get("type") as string | null) ?? "";
  const limit = (form.get("limit") as string | null) ?? "";

  if (!name) {
    return back(context, "Category name is required");
  }
  if (name.toLowerCase() === SYSTEM_OTHER_NAME.toLowerCase()) {
    return back(context, `"${SYSTEM_OTHER_NAME}" is a reserved category name`);
  }
  if (!CATEGORY_TYPES.includes(type as CategoryType)) {
    return back(context, "Pick a category type");
  }
  const parsed = parsePlnToCents(limit);
  if ("error" in parsed) {
    return back(context, parsed.error);
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
    return back(context, `The "other" category cannot be edited`);
  }

  const { error: updateError } = await supabase
    .from("categories")
    .update({ name, type, limit_cents: parsed.cents })
    .eq("id", id);

  if (updateError) {
    const msg =
      updateError.code === "23505" ? "A category with that name already exists for this year." : updateError.message;
    return back(context, msg);
  }

  return context.redirect("/categories");
};
