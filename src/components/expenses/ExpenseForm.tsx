import React, { useState, useEffect, useRef } from "react";
import { DollarSign, Tag, CalendarDays, CircleAlert, Pencil } from "lucide-react";
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

interface InitialValues {
  categoryId: string;
  amount: string;
  name: string;
  date: string;
}

interface Props {
  categories: Category[];
  today: string; // YYYY-MM-DD in Warsaw TZ
  serverError?: string | null;
  success?: boolean;
  action?: string;
  initial?: InitialValues;
  submitLabel?: string;
}

export default function ExpenseForm({
  categories,
  today,
  serverError,
  success: initialSuccess,
  action = "/api/expenses",
  initial,
  submitLabel = "Save expense",
}: Props) {
  const otherCategory = categories.find((c) => c.is_system) ?? categories[0];

  const seedId = initial?.categoryId ?? otherCategory.id;
  const seedName = initial?.name ?? otherCategory.name;

  const [selectedId, setSelectedId] = useState<string>(seedId);
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [name, setName] = useState(seedName);
  const [date, setDate] = useState(initial?.date ?? today);
  const [amountError, setAmountError] = useState<string | undefined>();
  const [showSuccess, setShowSuccess] = useState(initialSuccess ?? false);
  // Two-step flow: "pick" shows the category grid, "log" shows the amount/name/date panel.
  // Edit mode (initial values present) skips straight to the log panel since the category is known.
  const [step, setStep] = useState<"pick" | "log">(initial ? "log" : "pick");
  const amountRef = useRef<HTMLInputElement>(null);

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

  // When the log panel appears, move focus to the amount field so the user can type immediately.
  useEffect(() => {
    if (step === "log") {
      amountRef.current?.focus();
    }
  }, [step]);

  function selectCategory(cat: Category) {
    setSelectedId(cat.id);
    setName(cat.name);
    // Advance to the log panel in the same tap — protects the 10-second logging budget.
    setStep("log");
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

  // The currently chosen category, shown as a chip on the log panel.
  const selectedCat = categories.find((c) => c.id === selectedId) ?? otherCategory;

  return (
    <div>
      {showSuccess && (
        <div className="mb-4 rounded-xl border border-green-400/40 bg-green-500/20 px-4 py-3 text-center text-sm font-medium text-green-200">
          Expense saved! 🎉
        </div>
      )}

      {/* Step 1: category picker. type="button" controls never submit the form. */}
      {step === "pick" && (
        <fieldset className="space-y-3">
          <legend className="mb-3 block text-center text-lg font-semibold text-white">Pick a category</legend>
          <div className="grid grid-cols-1 gap-2">
            {orderedCats.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  selectCategory(cat);
                }}
                aria-pressed={selectedId === cat.id}
                className={cn(
                  "min-h-12 rounded-lg border px-3 py-2.5 text-center text-sm transition-colors",
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
        </fieldset>
      )}

      {/* Step 2: log panel. Hidden only — kept mounted so the amount ref is stable. */}
      <form
        method="POST"
        action={action}
        className={cn("space-y-5", step === "pick" && "hidden")}
        onSubmit={handleSubmit}
        noValidate
      >
        {/* Selected-category chip with a "Change" affordance back to Step 1. */}
        <div className="flex items-center justify-between gap-2 rounded-lg border border-purple-400/40 bg-purple-500/20 px-3 py-2">
          <span className="flex items-center gap-2 text-sm font-medium text-white">
            <Tag className="size-4 text-purple-200" />
            {selectedCat.name}
          </span>
          <button
            type="button"
            onClick={() => {
              setStep("pick");
            }}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-purple-200 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:outline-none"
          >
            <Pencil className="size-3" />
            Change
          </button>
        </div>

        {/* Hidden input carries the resolved category to the POST. */}
        <input type="hidden" name="category_id" value={selectedId} />

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
              ref={amountRef}
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

        <SubmitButton pendingText="Saving..." icon={<DollarSign className="size-5" />} className="py-3 text-base">
          {submitLabel}
        </SubmitButton>
      </form>
    </div>
  );
}
