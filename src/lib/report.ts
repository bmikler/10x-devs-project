export interface ReportCategory {
  id: string;
  name: string;
  type: string;
  limit_cents: number | null;
  is_system: boolean;
}

export interface ReportExpense {
  category_id: string;
  amount_cents: number;
}

export interface MonthlyRow {
  id: string;
  name: string;
  avgCents: number;
  limitCents: number;
  deltaCents: number;
  burnPct: number | null;
}

export interface YearlyRow {
  id: string;
  name: string;
  spentCents: number;
  limitCents: number;
  remainingCents: number;
  burnPct: number | null;
}

export interface OtherRow {
  name: string;
  spentCents: number;
}

export interface ReportViewModel {
  monthly: MonthlyRow[];
  yearly: YearlyRow[];
  other: OtherRow | null;
}

/** Widened expense row the monthly view fetches (vs `ReportExpense`, which is spend-only). */
export interface MonthExpense {
  id: string;
  category_id: string;
  name: string;
  amount_cents: number;
  expense_at: string;
}

export interface MonthExpenseRow {
  id: string;
  name: string;
  dateLabel: string;
  amountCents: number;
}

export interface MonthCategoryGroup {
  id: string;
  name: string;
  type: string;
  isSystem: boolean;
  spentCents: number;
  /** Monthly limit for recurring categories; `null` for irregular/"other". */
  limitCents: number | null;
  burnPct: number | null;
  expenses: MonthExpenseRow[];
}

export interface MonthBreakdown {
  groups: MonthCategoryGroup[];
}

// Warsaw-TZ formatters. Calendar derivation from `expense_at` must use
// Europe/Warsaw, never the host clock (UTC on Workers / arbitrary in the
// browser) — see context/foundation/lessons.md §Timezone convention.
const MONTH_KEY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "2-digit",
});

const DATE_LABEL_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Warsaw",
  day: "numeric",
  month: "short",
});

/** Bucket a TIMESTAMPTZ into its `"YYYY-MM"` month key in Europe/Warsaw. */
function warsawMonthKey(expenseAt: string): string {
  return MONTH_KEY_FMT.format(new Date(expenseAt));
}

/**
 * Group a single month's expenses by category for the monthly report.
 *
 * `monthKey` is `"YYYY-MM"`. Recurring categories are always emitted (so the
 * limit bar is stable month to month, even at zero spend) and compared against
 * their monthly `limit_cents`. Irregular and system ("other") categories are
 * emitted only when they have spend that month, and carry no limit. Groups sort
 * `is_system`-then-`name`; each group's expenses sort newest-first. Pure — safe
 * to import into a client island.
 */
export function buildMonthBreakdown(
  categories: ReportCategory[],
  expenses: MonthExpense[],
  monthKey: string,
): MonthBreakdown {
  const monthExpenses = expenses.filter((e) => warsawMonthKey(e.expense_at) === monthKey);

  const byCategoryId = monthExpenses.reduce<Map<string, MonthExpense[]>>((acc, e) => {
    const list = acc.get(e.category_id);
    if (list) {
      list.push(e);
    } else {
      acc.set(e.category_id, [e]);
    }
    return acc;
  }, new Map());

  const groups: MonthCategoryGroup[] = [];

  for (const cat of categories) {
    const catExpenses = byCategoryId.get(cat.id) ?? [];
    const isRecurring = cat.type === "recurring";

    // Irregular / "other" categories only appear in months where they have spend.
    if (!isRecurring && catExpenses.length === 0) {
      continue;
    }

    const spentCents = catExpenses.reduce((sum, e) => sum + e.amount_cents, 0);

    const rows: MonthExpenseRow[] = catExpenses
      .slice()
      .sort((a, b) => b.expense_at.localeCompare(a.expense_at))
      .map((e) => ({
        id: e.id,
        name: e.name,
        dateLabel: DATE_LABEL_FMT.format(new Date(e.expense_at)),
        amountCents: e.amount_cents,
      }));

    let limitCents: number | null = null;
    let burnPct: number | null = null;
    if (isRecurring) {
      limitCents = cat.limit_cents ?? 0;
      burnPct = limitCents > 0 ? Math.round((spentCents / limitCents) * 100) : null;
    }

    groups.push({
      id: cat.id,
      name: cat.name,
      type: cat.type,
      isSystem: cat.is_system,
      spentCents,
      limitCents,
      burnPct,
      expenses: rows,
    });
  }

  groups.sort((a, b) => {
    if (a.isSystem !== b.isSystem) {
      return a.isSystem ? 1 : -1;
    }
    return a.name.localeCompare(b.name);
  });

  return { groups };
}

export function buildReport(
  categories: ReportCategory[],
  expenses: ReportExpense[],
  elapsedMonths: number,
): ReportViewModel {
  const spentByCategoryId = expenses.reduce<Map<string, number>>(
    (acc, e) => acc.set(e.category_id, (acc.get(e.category_id) ?? 0) + e.amount_cents),
    new Map(),
  );

  const monthly: MonthlyRow[] = [];
  const yearly: YearlyRow[] = [];
  let other: OtherRow | null = null;

  for (const cat of categories) {
    const totalSpent = spentByCategoryId.get(cat.id) ?? 0;

    if (cat.is_system) {
      other = { name: cat.name, spentCents: totalSpent };
      continue;
    }

    if (cat.type === "recurring") {
      const limit = cat.limit_cents ?? 0;
      const avg = Math.round(totalSpent / elapsedMonths);
      monthly.push({
        id: cat.id,
        name: cat.name,
        avgCents: avg,
        limitCents: limit,
        deltaCents: limit - avg,
        burnPct: limit > 0 ? Math.round((avg / limit) * 100) : null,
      });
    } else {
      const limit = cat.limit_cents ?? 0;
      yearly.push({
        id: cat.id,
        name: cat.name,
        spentCents: totalSpent,
        limitCents: limit,
        remainingCents: limit - totalSpent,
        burnPct: limit > 0 ? Math.round((totalSpent / limit) * 100) : null,
      });
    }
  }

  monthly.sort((a, b) => a.name.localeCompare(b.name));
  yearly.sort((a, b) => a.name.localeCompare(b.name));

  return { monthly, yearly, other };
}
