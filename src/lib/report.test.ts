import { describe, it, expect } from "vitest";
import { buildReport, buildMonthBreakdown } from "@/lib/report";
import type { ReportCategory, MonthExpense } from "@/lib/report";

// ── Fixtures ────────────────────────────────────────────────────────────────

function cat(
  id: string,
  name: string,
  type: string,
  limit_cents: number | null = null,
  is_system = false,
): ReportCategory {
  return { id, name, type, limit_cents, is_system };
}

function spent(category_id: string, amount_cents: number) {
  return { category_id, amount_cents };
}

// Throws (rather than returning undefined) so callers need no ! assertion.
function findGroup(groups: ReturnType<typeof buildMonthBreakdown>["groups"], id: string) {
  const g = groups.find((g) => g.id === id);
  if (g === undefined) throw new Error(`Group "${id}" not found`);
  return g;
}

// ── buildReport ─────────────────────────────────────────────────────────────

describe("buildReport", () => {
  it("is a function (alias resolution sanity check)", () => {
    expect(typeof buildReport).toBe("function");
  });

  describe("recurring category", () => {
    it("under budget: avg, delta, burnPct", () => {
      const result = buildReport([cat("r1", "Rent", "recurring", 5000)], [spent("r1", 3000)], 1);
      const row = result.monthly[0];
      // avg=round(3000/1)=3000; delta=5000−3000=2000; burn=round(3000/5000×100)=60
      expect(row.avgCents).toBe(3000);
      expect(row.limitCents).toBe(5000);
      expect(row.deltaCents).toBe(2000);
      expect(row.burnPct).toBe(60);
    });

    it("overspend: delta negative, burnPct > 100 (not clamped)", () => {
      const result = buildReport([cat("r1", "Food", "recurring", 5000)], [spent("r1", 6000)], 1);
      const row = result.monthly[0];
      // avg=6000; delta=5000−6000=−1000; burn=round(6000/5000×100)=120
      expect(row.avgCents).toBe(6000);
      expect(row.deltaCents).toBe(-1000);
      expect(row.burnPct).toBe(120);
    });

    it("rounding-order: burnPct derives from rounded avg, not the raw quotient", () => {
      // totalSpent=599, elapsedMonths=4, limit=400
      // raw avg = 149.75  →  rounded avg = 150
      // burnPct from rounded avg:  round(150/400×100) = round(37.5)   = 38  ← correct
      // burnPct from raw avg:      round(149.75/400×100) = round(37.4375) = 37  ← wrong oracle
      const result = buildReport(
        [cat("r1", "Food", "recurring", 400)],
        [spent("r1", 200), spent("r1", 200), spent("r1", 199)],
        4,
      );
      const row = result.monthly[0];
      expect(row.avgCents).toBe(150);
      expect(row.deltaCents).toBe(250); // 400−150
      expect(row.burnPct).toBe(38); // NOT 37
    });

    it("limit = 0: burnPct is null", () => {
      const result = buildReport([cat("r1", "Misc", "recurring", 0)], [spent("r1", 1000)], 1);
      expect(result.monthly[0].burnPct).toBeNull();
    });

    it("limit = null: treated as 0, limitCents = 0, burnPct is null", () => {
      const result = buildReport([cat("r1", "Misc", "recurring", null)], [spent("r1", 1000)], 1);
      const row = result.monthly[0];
      expect(row.limitCents).toBe(0);
      expect(row.burnPct).toBeNull();
    });
  });

  describe("irregular category", () => {
    it("under budget: cumulative spent, remaining, burnPct", () => {
      const result = buildReport(
        [cat("i1", "Vacation", "irregular", 10000)],
        [spent("i1", 3000), spent("i1", 4000)],
        3,
      );
      const row = result.yearly[0];
      // spentCents=7000; remaining=10000−7000=3000; burn=round(7000/10000×100)=70
      expect(row.spentCents).toBe(7000);
      expect(row.limitCents).toBe(10000);
      expect(row.remainingCents).toBe(3000);
      expect(row.burnPct).toBe(70);
    });

    it("overspend: remainingCents negative (not clamped), burnPct > 100", () => {
      const result = buildReport([cat("i1", "Vacation", "irregular", 10000)], [spent("i1", 12000)], 1);
      const row = result.yearly[0];
      // remaining=10000−12000=−2000; burn=round(12000/10000×100)=120
      expect(row.remainingCents).toBe(-2000);
      expect(row.burnPct).toBe(120);
    });
  });

  describe("system category", () => {
    it("appears in other only — monthly and yearly are empty", () => {
      const result = buildReport([cat("sys1", "other", "irregular", null, true)], [spent("sys1", 500)], 1);
      expect(result.monthly).toHaveLength(0);
      expect(result.yearly).toHaveLength(0);
      expect(result.other).toEqual({ name: "other", spentCents: 500 });
    });
  });

  describe("sorting", () => {
    it("monthly and yearly are sorted alphabetically by name", () => {
      const categories = [
        cat("r3", "Zebra", "recurring", 1000),
        cat("r1", "Apple", "recurring", 1000),
        cat("r2", "Mango", "recurring", 1000),
        cat("i2", "Zoo", "irregular", 2000),
        cat("i1", "Books", "irregular", 2000),
      ];
      const result = buildReport(categories, [], 1);
      expect(result.monthly.map((r) => r.name)).toEqual(["Apple", "Mango", "Zebra"]);
      expect(result.yearly.map((r) => r.name)).toEqual(["Books", "Zoo"]);
    });
  });

  describe("zero-spend category", () => {
    it("totalSpent = 0 → avgCents = 0, deltaCents = limit, burnPct = 0", () => {
      const result = buildReport([cat("r1", "Rent", "recurring", 5000)], [], 3);
      const row = result.monthly[0];
      // avg=round(0/3)=0; delta=5000−0=5000; burn=round(0/5000×100)=0
      expect(row.avgCents).toBe(0);
      expect(row.deltaCents).toBe(5000);
      expect(row.burnPct).toBe(0);
    });
  });
});

// ── buildMonthBreakdown ──────────────────────────────────────────────────────

describe("buildMonthBreakdown", () => {
  const CATEGORIES: ReportCategory[] = [
    cat("r1", "Rent", "recurring", 5000),
    cat("r2", "Groceries", "recurring", 3000),
    cat("i1", "Travel", "irregular", 10000),
    cat("sys1", "other", "irregular", null, true),
  ];

  // All at noon Warsaw (UTC+1 in winter → T11:00Z); one Feb expense to test filtering.
  const EXPENSES: MonthExpense[] = [
    { id: "e1", category_id: "r1", name: "rent jan 15", amount_cents: 1000, expense_at: "2026-01-15T11:00:00.000Z" },
    { id: "e2", category_id: "r1", name: "rent jan 20", amount_cents: 2000, expense_at: "2026-01-20T11:00:00.000Z" },
    { id: "e3", category_id: "i1", name: "train jan 10", amount_cents: 500, expense_at: "2026-01-10T11:00:00.000Z" },
    // February — must NOT appear in the Jan breakdown
    { id: "e4", category_id: "r1", name: "rent feb", amount_cents: 3000, expense_at: "2026-02-10T11:00:00.000Z" },
  ];

  it("filters to the requested month only", () => {
    const result = buildMonthBreakdown(CATEGORIES, EXPENSES, "2026-01");
    const rent = findGroup(result.groups, "r1");
    // Only e1 and e2 (not e4 which is Feb)
    expect(rent.expenses).toHaveLength(2);
    expect(rent.spentCents).toBe(3000);
  });

  it("emits every category even at zero spend", () => {
    const result = buildMonthBreakdown(CATEGORIES, EXPENSES, "2026-01");
    const groceries = findGroup(result.groups, "r2");
    // Groceries has no Jan expenses
    expect(groceries.spentCents).toBe(0);
    expect(groceries.expenses).toHaveLength(0);
  });

  it("groups sort recurring → irregular → system, then alphabetical within band", () => {
    const result = buildMonthBreakdown(CATEGORIES, EXPENSES, "2026-01");
    // recurring: Groceries, Rent; irregular: Travel; system: other
    expect(result.groups.map((g) => g.name)).toEqual(["Groceries", "Rent", "Travel", "other"]);
  });

  it("per-group expenses sort newest-first", () => {
    const result = buildMonthBreakdown(CATEGORIES, EXPENSES, "2026-01");
    const rent = findGroup(result.groups, "r1");
    // e2 (Jan 20) before e1 (Jan 15)
    expect(rent.expenses[0].id).toBe("e2");
    expect(rent.expenses[1].id).toBe("e1");
  });

  it("recurring burnPct: round(spent/limit×100) when limit > 0", () => {
    const result = buildMonthBreakdown(CATEGORIES, EXPENSES, "2026-01");
    const rent = findGroup(result.groups, "r1");
    // spentCents=3000, limitCents=5000 → burnPct=round(3000/5000×100)=60
    expect(rent.burnPct).toBe(60);
    expect(rent.limitCents).toBe(5000);
  });

  it("irregular and system categories carry limitCents: null, burnPct: null", () => {
    const result = buildMonthBreakdown(CATEGORIES, EXPENSES, "2026-01");
    const travel = findGroup(result.groups, "i1");
    const other = findGroup(result.groups, "sys1");
    expect(travel.limitCents).toBeNull();
    expect(travel.burnPct).toBeNull();
    expect(other.limitCents).toBeNull();
    expect(other.burnPct).toBeNull();
  });
});
