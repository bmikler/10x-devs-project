import React, { useState, useEffect } from "react";
import { DollarSign, Tag, CalendarDays, CircleAlert } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { cn } from "@/lib/utils";
import { parsePlnToCents } from "@/lib/money";

interface Category {
  id: string;
  name: string;
  is_system: boolean;
}

interface Props {
  categories: Category[];
  today: string; // YYYY-MM-DD in Warsaw TZ
  serverError?: string | null;
  success?: boolean;
}

export default function ExpenseForm({ categories, today, serverError, success: initialSuccess }: Props) {
  const otherCategory = categories.find((c) => c.is_system) ?? categories[0];

  const [selectedId, setSelectedId] = useState<string>(otherCategory.id);
  const [amount, setAmount] = useState("");
  const [name, setName] = useState(otherCategory.name);
  const [date, setDate] = useState(today);
  const [amountError, setAmountError] = useState<string | undefined>();
  const [showSuccess, setShowSuccess] = useState(initialSuccess ?? false);

  // Auto-dismiss success banner after ~4 seconds.
  useEffect(() => {
    if (!showSuccess) return;
    const timer = setTimeout(() => {
      setShowSuccess(false);
    }, 4000);
    return () => {
      clearTimeout(timer);
    };
  }, [showSuccess]);

  function selectCategory(cat: Category) {
    setSelectedId(cat.id);
    setName(cat.name);
  }

  function validateAmount(): boolean {
    if (!amount.trim()) {
      setAmountError("Amount is required");
      return false;
    }
    const parsed = parsePlnToCents(amount);
    if ("error" in parsed) {
      setAmountError(parsed.error);
      return false;
    }
    setAmountError(undefined);
    return true;
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validateAmount()) {
      e.preventDefault();
    }
  }

  // Split categories: system "other" last; user categories first (sorted by name already from server).
  const userCats = categories.filter((c) => !c.is_system);
  const systemCats = categories.filter((c) => c.is_system);
  const orderedCats = [...userCats, ...systemCats];

  return (
    <div>
      {showSuccess && (
        <div className="mb-4 rounded-xl border border-green-400/40 bg-green-500/20 px-4 py-3 text-center text-sm font-medium text-green-200">
          Expense saved! 🎉
        </div>
      )}

      <form method="POST" action="/api/expenses" className="space-y-5" onSubmit={handleSubmit} noValidate>
        {/* Category grid */}
        <div>
          <span className="mb-2 block text-sm text-blue-100/80">Category</span>
          <div className="grid grid-cols-2 gap-2">
            {orderedCats.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  selectCategory(cat);
                }}
                aria-pressed={selectedId === cat.id}
                className={cn(
                  "min-h-12 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                  selectedId === cat.id
                    ? "border-purple-400 bg-purple-500/30 text-white"
                    : cat.is_system
                      ? "border-amber-300/30 bg-amber-400/10 text-amber-100/80 hover:bg-amber-400/20"
                      : "border-white/20 bg-white/10 text-blue-100/80 hover:bg-white/20",
                )}
              >
                <span className="font-medium">{cat.name}</span>
                {cat.is_system && <span className="ml-1 text-xs text-amber-200/60">(catch-all)</span>}
              </button>
            ))}
          </div>
          {/* Hidden inputs carry the resolved values to the POST. */}
          <input type="hidden" name="category_id" value={selectedId} />
        </div>

        {/* Amount — inline so we can set inputMode="decimal" for mobile numeric keyboard */}
        <div>
          <label htmlFor="amount" className="mb-1 block text-sm text-blue-100/80">
            Amount (PLN)
          </label>
          <div className="relative">
            <span className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">
              <DollarSign className="size-4" />
            </span>
            <input
              id="amount"
              name="amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                if (amountError) setAmountError(undefined);
              }}
              placeholder="42.50"
              className={cn(
                "w-full rounded-lg border bg-white/10 px-3 py-2 pl-10 text-white placeholder-white/40 transition-colors focus:ring-2 focus:outline-none",
                amountError ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
              )}
            />
          </div>
          {amountError && (
            <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
              <CircleAlert className="size-3" />
              {amountError}
            </p>
          )}
        </div>

        {/* Name */}
        <FormField
          id="expense-name"
          name="name"
          label="Name"
          value={name}
          onChange={setName}
          placeholder="e.g. Biedronka"
          icon={<Tag className="size-4" />}
        />

        {/* Date */}
        <div>
          <label htmlFor="expense-date" className="mb-1 block text-sm text-blue-100/80">
            Date
          </label>
          <div className="relative">
            <span className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">
              <CalendarDays className="size-4" />
            </span>
            <input
              id="expense-date"
              name="date"
              type="date"
              value={date}
              max={today}
              onChange={(e) => {
                setDate(e.target.value);
              }}
              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 pl-10 text-white transition-colors focus:ring-2 focus:ring-purple-400 focus:outline-none"
            />
          </div>
        </div>

        <ServerError message={serverError} />

        <SubmitButton pendingText="Saving..." icon={<DollarSign className="size-4" />}>
          Save expense
        </SubmitButton>
      </form>
    </div>
  );
}
