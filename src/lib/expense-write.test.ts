import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { warsawNoon, validateExpenseFields } from "@/lib/expense-write";

// ── warsawNoon ───────────────────────────────────────────────────────────────

describe("warsawNoon", () => {
  it("winter date (UTC+1): stores at T11:00:00.000Z", () => {
    expect(warsawNoon("2026-01-15")).toBe("2026-01-15T11:00:00.000Z");
  });

  it("summer date (UTC+2): stores at T10:00:00.000Z", () => {
    expect(warsawNoon("2026-07-15")).toBe("2026-07-15T10:00:00.000Z");
  });

  it("Dec 31 stays on Dec 31 in Warsaw (year-boundary noon invariant)", () => {
    const result = warsawNoon("2026-12-31");
    const warsawDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Warsaw",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(result));
    expect(warsawDay).toBe("2026-12-31");
  });

  it("Jan 1 stays on Jan 1 in Warsaw (year-boundary noon invariant)", () => {
    const result = warsawNoon("2026-01-01");
    const warsawDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Warsaw",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(result));
    expect(warsawDay).toBe("2026-01-01");
  });
});

// ── validateExpenseFields ────────────────────────────────────────────────────

function makeForm(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    form.set(k, v);
  }
  return form;
}

describe("validateExpenseFields", () => {
  it("missing amount → 'Amount is required'", () => {
    expect(validateExpenseFields(new FormData())).toEqual({ error: "Amount is required" });
  });

  it("bad amount → parser error surfaced", () => {
    const form = makeForm({ amount: "abc", category_id: "cat1" });
    expect(validateExpenseFields(form)).toEqual({
      error: "Enter a valid amount in PLN (max 2 decimal places)",
    });
  });

  it("missing category → 'Category is required'", () => {
    const form = makeForm({ amount: "100" });
    expect(validateExpenseFields(form)).toEqual({ error: "Category is required" });
  });

  it("non-YYYY-MM-DD date → 'Invalid date'", () => {
    const form = makeForm({ amount: "100", category_id: "cat1", date: "15-01-2026" });
    expect(validateExpenseFields(form)).toEqual({ error: "Invalid date" });
  });

  // Tests that touch todayInWarsaw() are grouped with a deterministic clock.
  // Fake time 2026-01-15T11:00:00.000Z = noon Warsaw (UTC+1) → todayInWarsaw() = "2026-01-15".
  describe("with fake timers (today = 2026-01-15 Warsaw)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-15T11:00:00.000Z"));
    });
    afterEach(() => vi.useRealTimers());

    it("blank date defaults to todayInWarsaw()", () => {
      const form = makeForm({ amount: "100", category_id: "cat1" });
      expect(validateExpenseFields(form)).toEqual({
        amountCents: 10000,
        categoryId: "cat1",
        dateStr: "2026-01-15",
        expenseAt: warsawNoon("2026-01-15"),
      });
    });

    it("future date → 'Date cannot be in the future'", () => {
      const form = makeForm({ amount: "100", category_id: "cat1", date: "2026-01-16" });
      expect(validateExpenseFields(form)).toEqual({ error: "Date cannot be in the future" });
    });

    it("valid past date → expenseAt = warsawNoon(date)", () => {
      const form = makeForm({ amount: "50", category_id: "cat1", date: "2026-01-10" });
      expect(validateExpenseFields(form)).toEqual({
        amountCents: 5000,
        categoryId: "cat1",
        dateStr: "2026-01-10",
        expenseAt: warsawNoon("2026-01-10"),
      });
    });
  });
});
