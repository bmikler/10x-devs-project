import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { makeUsers } from "./helpers/supabase";
import type { UsersFixture } from "./helpers/supabase";
import { SYSTEM_OTHER_NAME } from "@/lib/categories";

const TEST_YEAR = 2026;

describe("mutation-safety: cascade + durability", () => {
  let users: UsersFixture;
  let otherId: string;
  let foodId: string;
  const expenseIds: string[] = [];

  beforeAll(async () => {
    users = await makeUsers();
    const { a } = users;

    // Seed "other" system category directly — auth.admin.createUser does NOT seed it.
    // RLS WITH CHECK permits this insert (user_id = auth.uid()); no INSERT trigger blocks is_system = true.
    // Omit limit_cents — categories_system_limit_check requires NULL for system rows.
    const { data: other, error: otherErr } = await a.client
      .from("categories")
      .insert({ user_id: a.id, year: TEST_YEAR, name: SYSTEM_OTHER_NAME, type: "irregular", is_system: true })
      .select("id")
      .single();
    if (otherErr) throw new Error(`Seed "other": ${otherErr.message}`);
    otherId = other.id as string;

    const { data: food, error: foodErr } = await a.client
      .from("categories")
      .insert({ user_id: a.id, year: TEST_YEAR, name: "food", type: "recurring", limit_cents: 50000 })
      .select("id")
      .single();
    if (foodErr) throw new Error(`Seed "food": ${foodErr.message}`);
    foodId = food.id as string;

    const { data: exps, error: expErr } = await a.client
      .from("expenses")
      .insert([
        { user_id: a.id, category_id: foodId, name: "lunch", amount_cents: 1000 },
        { user_id: a.id, category_id: foodId, name: "dinner", amount_cents: 2000 },
      ])
      .select("id");
    if (expErr) throw new Error(`Seed expenses: ${expErr.message}`);
    expenseIds.push(...(exps as { id: string }[]).map((e) => e.id));
  });

  afterAll(async () => {
    await users.cleanup();
  });

  // Run before the cascade test — proves the insert succeeded and is readable.
  it("durability: expenses are readable after save", async () => {
    const { data, error } = await users.a.client.from("expenses").select("id").in("id", expenseIds);

    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });

  it('cascade: expenses are reassigned to "other" and none are lost after category delete', async () => {
    const { error: deleteErr } = await users.a.client.from("categories").delete().eq("id", foodId);

    expect(deleteErr).toBeNull();

    const { data, error } = await users.a.client.from("expenses").select("category_id").in("id", expenseIds);

    expect(error).toBeNull();
    expect(data).toHaveLength(2); // none lost
    expect((data as { category_id: string }[]).every((e) => e.category_id === otherId)).toBe(true);
  });

  it('system-category backstop: deleting "other" is blocked at the DB', async () => {
    const { error } = await users.a.client.from("categories").delete().eq("id", otherId);

    // fn_cascade_to_other raises RAISE EXCEPTION for is_system rows when the owning user still exists.
    expect(error).not.toBeNull();

    const { data } = await users.a.client.from("categories").select("id").eq("id", otherId);
    expect(data).toHaveLength(1);
  });

  it("DB constraint backstop: amount_cents = 0 is rejected", async () => {
    const { error } = await users.a.client
      .from("expenses")
      .insert({ user_id: users.a.id, category_id: otherId, name: "bad", amount_cents: 0 });

    expect(error).not.toBeNull();

    const { data } = await users.a.client.from("expenses").select("id").eq("name", "bad");
    expect(data).toHaveLength(0);
  });
});
