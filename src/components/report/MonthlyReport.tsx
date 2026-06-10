import { useState } from "react";
import { buildMonthBreakdown } from "@/lib/report";
import type { ReportCategory, MonthExpense } from "@/lib/report";
import { formatCentsToPln } from "@/lib/money";

interface MonthOption {
  key: string;
  label: string;
}

interface Props {
  categories: ReportCategory[];
  expenses: MonthExpense[];
  months: MonthOption[];
  defaultMonth: string;
}

export default function MonthlyReport({ categories, expenses, months, defaultMonth }: Props) {
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);

  const breakdown = buildMonthBreakdown(categories, expenses, selectedMonth);
  const selectedLabel = months.find((m) => m.key === selectedMonth)?.label ?? selectedMonth;
  const hasAnyExpenses = breakdown.groups.some((g) => g.expenses.length > 0);

  return (
    <div>
      <label htmlFor="month-select" className="mb-1 block text-sm text-blue-100/80">
        Month
      </label>
      <select
        id="month-select"
        value={selectedMonth}
        onChange={(e) => {
          setSelectedMonth(e.target.value);
        }}
        className="mb-6 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white transition-colors focus:ring-2 focus:ring-purple-400 focus:outline-none"
      >
        {months.map((m) => (
          <option key={m.key} value={m.key} className="bg-slate-900 text-white">
            {m.label}
          </option>
        ))}
      </select>

      {!hasAnyExpenses && (
        <p className="mb-6 text-center text-sm text-blue-100/60">No expenses logged in {selectedLabel}.</p>
      )}

      <ul className="flex flex-col gap-3">
        {breakdown.groups.map((group) => {
          const isRecurring = group.limitCents !== null;
          const remainingCents = isRecurring ? (group.limitCents ?? 0) - group.spentCents : 0;

          return (
            <li
              key={group.id}
              className={
                group.isSystem
                  ? "rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4 text-white"
                  : "rounded-2xl border border-white/10 bg-white/10 p-4 text-white backdrop-blur-xl"
              }
            >
              <div className={group.isSystem ? "mb-2 font-semibold text-amber-100" : "mb-2 font-semibold"}>
                {group.name}
              </div>

              <div className="flex justify-between text-sm text-blue-100/70">
                <span>Spent</span>
                <span>{formatCentsToPln(group.spentCents)}</span>
              </div>

              {isRecurring && (
                <>
                  <div className="flex justify-between text-sm text-blue-100/70">
                    <span>Limit / month</span>
                    <span>{formatCentsToPln(group.limitCents ?? 0)}</span>
                  </div>
                  <div className="mt-2 flex justify-between border-t border-white/10 pt-2 text-sm font-medium">
                    <span className="text-blue-100/70">{remainingCents < 0 ? "Over" : "Under"}</span>
                    <span className={remainingCents < 0 ? "text-red-400" : "text-emerald-300"}>
                      {formatCentsToPln(remainingCents)}
                    </span>
                  </div>
                  {group.burnPct !== null && (
                    <div className="flex justify-between text-sm font-medium">
                      <span className="text-blue-100/70">Burn</span>
                      <span className={group.burnPct > 100 ? "text-amber-400" : "text-blue-100/70"}>
                        {group.burnPct}%
                      </span>
                    </div>
                  )}
                </>
              )}

              {group.expenses.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1 border-t border-white/10 pt-3">
                  {group.expenses.map((expense) => (
                    <li key={expense.id} className="flex justify-between gap-2 text-sm">
                      <span className="flex min-w-0 gap-2">
                        <span className="shrink-0 text-blue-100/50">{expense.dateLabel}</span>
                        <span className="truncate text-blue-100/90">{expense.name}</span>
                      </span>
                      <span className="shrink-0 text-blue-100/80">{formatCentsToPln(expense.amountCents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
