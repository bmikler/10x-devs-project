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

  const form = await context.request.formData();
  const name = ((form.get("name") as string | null) ?? "").trim();
  const type = (form.get("type") as string | null) ?? "";
  const limit = (form.get("limit") as string | null) ?? "";

  // Validation (server-side, mirrors the client island).
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

  // Insert the user category first: a failed/duplicate insert leaves no stray
  // "other" row behind.
  const { error: insertError } = await supabase.from("categories").insert({
    user_id: user.id,
    year,
    name,
    type,
    limit_cents: parsed.cents,
  });
  if (insertError) {
    const msg =
      insertError.code === "23505" ? "A category with that name already exists for this year." : insertError.message;
    return back(context, msg);
  }

  // Idempotently seed the per-(user, year) system "other" row. The unique
  // (user_id, year, name) makes repeat creates a no-op via ignoreDuplicates.
  // system_limit_check forbids a limit here, so limit_cents stays null.
  const { error: seedError } = await supabase.from("categories").upsert(
    {
      user_id: user.id,
      year,
      name: SYSTEM_OTHER_NAME,
      type: "irregular",
      is_system: true,
    },
    { onConflict: "user_id,year,name", ignoreDuplicates: true },
  );
  if (seedError) {
    return back(context, seedError.message);
  }

  return context.redirect("/categories");
};
