import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Pencil, Trash2 } from "lucide-react";
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
  // Categories collapse by default; users toggle each one open independently.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  function toggle(categoryId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }

  const index = months.findIndex((m) => m.key === selectedMonth);
  const atFirst = index <= 0;
  const atLast = index >= months.length - 1;
  const selectedLabel = months[index]?.label ?? selectedMonth;

  function step(delta: number) {
    const next = index + delta;
    if (next >= 0 && next < months.length) {
      setSelectedMonth(months[next].key);
    }
  }

  const breakdown = buildMonthBreakdown(categories, expenses, selectedMonth);
  const hasAnyExpenses = breakdown.groups.some((g) => g.expenses.length > 0);

  return (
    <div>
      {/* Month switcher: < June > */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            step(-1);
          }}
          disabled={atFirst}
          aria-label="Previous month"
          className="flex size-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white/10"
        >
          <ChevronLeft className="size-5" />
        </button>
        <span className="text-lg font-semibold text-white">{selectedLabel}</span>
        <button
          type="button"
          onClick={() => {
            step(1);
          }}
          disabled={atLast}
          aria-label="Next month"
          className="flex size-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white/10"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      {!hasAnyExpenses && (
        <p className="mb-6 text-center text-sm text-blue-100/60">No expenses logged in {selectedLabel}.</p>
      )}

      <ul className="flex flex-col gap-3">
        {breakdown.groups.map((group) => {
          const isRecurring = group.limitCents !== null;
          // Traffic light vs the monthly limit: over → red, equal → yellow, under → green.
          let spendColor = "text-white";
          if (isRecurring) {
            const limit = group.limitCents ?? 0;
            if (group.spentCents > limit) {
              spendColor = "text-red-400";
            } else if (group.spentCents === limit) {
              spendColor = "text-amber-300";
            } else {
              spendColor = "text-emerald-300";
            }
          }

          const hasExpenses = group.expenses.length > 0;
          const isOpen = hasExpenses && expanded.has(group.id);

          return (
            <li
              key={group.id}
              className={
                group.isSystem
                  ? "overflow-hidden rounded-2xl border border-amber-300/30 bg-amber-400/10 text-white"
                  : "overflow-hidden rounded-2xl border border-white/10 bg-white/10 text-white backdrop-blur-xl"
              }
            >
              {/* Header: name + spending / limit. Clickable to toggle details when there are expenses. */}
              <button
                type="button"
                onClick={
                  hasExpenses
                    ? () => {
                        toggle(group.id);
                      }
                    : undefined
                }
                disabled={!hasExpenses}
                aria-expanded={hasExpenses ? isOpen : undefined}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors enabled:hover:bg-white/5 disabled:cursor-default"
              >
                <div
                  className={
                    group.isSystem ? "min-w-0 truncate font-semibold text-amber-100" : "min-w-0 truncate font-semibold"
                  }
                >
                  {group.name}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`font-semibold ${spendColor}`}>
                    {formatCentsToPln(group.spentCents)}
                    {isRecurring && (
                      <span className="text-blue-100/50"> / {formatCentsToPln(group.limitCents ?? 0)}</span>
                    )}
                  </span>
                  <ChevronDown
                    className={`size-4 transition-transform ${hasExpenses ? "text-blue-100/50" : "invisible"} ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </div>
              </button>

              {/* Expense rows: date · text · amount · edit · delete */}
              {isOpen && (
                <ul className="border-t border-white/10 bg-black/10">
                  {group.expenses.map((expense) => (
                    <li
                      key={expense.id}
                      className="flex flex-col gap-1 px-4 py-2 text-sm not-last:border-b not-last:border-white/5"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-14 shrink-0 text-blue-100/50">{expense.dateLabel}</span>
                        <span className="min-w-0 flex-1 truncate text-blue-100/90">{expense.name}</span>
                        <span className="shrink-0 text-blue-100/80">{formatCentsToPln(expense.amountCents)}</span>
                        <a
                          href={`/expenses/${expense.id}/edit`}
                          aria-label="Edit expense"
                          className="shrink-0 text-blue-100/40 transition-colors hover:text-purple-300"
                        >
                          <Pencil className="size-3.5" />
                        </a>
                        <button
                          type="button"
                          aria-label="Delete expense"
                          onClick={() => {
                            setConfirmingId(expense.id === confirmingId ? null : expense.id);
                          }}
                          className="shrink-0 text-blue-100/40 transition-colors hover:text-red-400"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>

                      {confirmingId === expense.id && (
                        <div className="flex items-center gap-2 pl-[4.25rem]">
                          <span className="text-xs text-blue-100/60">Delete this expense?</span>
                          <form method="POST" action={`/api/expenses/${expense.id}`}>
                            <input type="hidden" name="intent" value="delete" />
                            <button
                              type="submit"
                              className="rounded px-2 py-0.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-400/20"
                            >
                              Confirm
                            </button>
                          </form>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmingId(null);
                            }}
                            className="rounded px-2 py-0.5 text-xs text-blue-100/50 transition-colors hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
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
