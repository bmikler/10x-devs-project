import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { makeUsers } from "./helpers/supabase";
import type { UsersFixture } from "./helpers/supabase";

describe("data-isolation: cross-user denial matrix", () => {
  let users: UsersFixture;
  let aCategoryId: string;
  let aExpenseId: string;

  beforeAll(async () => {
    users = await makeUsers();
    const { a } = users;

    const { data: cat, error: catErr } = await a.client
      .from("categories")
      .insert({ user_id: a.id, year: 2026, name: "A-category", type: "irregular", limit_cents: 10000 })
      .select("id")
      .single();
    if (catErr) throw new Error(`Seed category: ${catErr.message}`);
    aCategoryId = cat.id as string;

    const { data: exp, error: expErr } = await a.client
      .from("expenses")
      .insert({ user_id: a.id, category_id: aCategoryId, name: "A-expense", amount_cents: 500 })
      .select("id")
      .single();
    if (expErr) throw new Error(`Seed expense: ${expErr.message}`);
    aExpenseId = exp.id as string;
  });

  afterAll(async () => {
    await users.cleanup();
  });

  it("read denial: B cannot see A's categories (USING)", async () => {
    const { data, error } = await users.b.client.from("categories").select("id").eq("id", aCategoryId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("update no-op: B cannot modify A's category name", async () => {
    const { error } = await users.b.client.from("categories").update({ name: "Hacked by B" }).eq("id", aCategoryId);

    // RLS makes this a silent 0-row no-op — no error surface
    expect(error).toBeNull();

    // Assert DB state: A's row unchanged
    const { data } = await users.a.client.from("categories").select("name").eq("id", aCategoryId).single();
    expect(data?.name).toBe("A-category");
  });

  it("delete no-op: B cannot delete A's expense", async () => {
    const { error } = await users.b.client.from("expenses").delete().eq("id", aExpenseId);

    expect(error).toBeNull();

    // Assert DB state: A's expense still present
    const { data } = await users.a.client.from("expenses").select("id").eq("id", aExpenseId).single();
    expect(data?.id).toBe(aExpenseId);
  });

  it("forged insert: B cannot insert a category with A's user_id (WITH CHECK)", async () => {
    const { data, error } = await users.b.client
      .from("categories")
      .insert({ user_id: users.a.id, year: 2026, name: "Forged", type: "irregular", limit_cents: 1 })
      .select("id");

    // WITH CHECK violation must surface as an error or produce 0 rows
    const inserted = error ? [] : (data as unknown[]);
    expect(inserted).toHaveLength(0);

    // Belt-and-suspenders: A sees no "Forged" category
    const { data: check } = await users.a.client.from("categories").select("id").eq("name", "Forged");
    expect(check).toHaveLength(0);
  });

  it("cross-user FK: B may reference A's category id but gains no visibility into A's data", async () => {
    // B needs its own category first (for its own expense inserts later)
    const { error: bCatErr } = await users.b.client
      .from("categories")
      .insert({ user_id: users.b.id, year: 2026, name: "B-category", type: "irregular", limit_cents: 1 })
      .select("id")
      .single();
    if (bCatErr) throw new Error(`B category seed: ${bCatErr.message}`);

    // Postgres runs FK integrity checks with system privileges, bypassing RLS, so
    // this insert SUCCEEDS even though B cannot read A's category. Not an isolation
    // hole: the row is B's own and exposes none of A's data.
    const { data, error } = await users.b.client
      .from("expenses")
      .insert({ user_id: users.b.id, category_id: aCategoryId, name: "Cross-FK", amount_cents: 1 })
      .select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    // The actual guarantee: B still cannot read A's category...
    const { data: aCatFromB } = await users.b.client.from("categories").select("id").eq("id", aCategoryId);
    expect(aCatFromB).toHaveLength(0);

    // ...and A's category is unchanged from A's own view.
    const { data: aCatFromA } = await users.a.client.from("categories").select("name").eq("id", aCategoryId).single();
    expect(aCatFromA?.name).toBe("A-category");

    // Clean up B's cross-referencing row so user-delete teardown doesn't hit the category FK.
    await users.b.client.from("expenses").delete().eq("name", "Cross-FK");
  });
});
