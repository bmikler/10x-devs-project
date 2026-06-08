import type { CategoryType } from "./categories";

export interface ReportCategory {
  id: string;
  name: string;
  type: CategoryType;
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
