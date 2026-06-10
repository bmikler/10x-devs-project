import React, { useState } from "react";
import { Tag, Wallet, FolderPlus, Save } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { cn } from "@/lib/utils";
import { parsePlnToCents } from "@/lib/money";
import { SYSTEM_OTHER_NAME, type CategoryType } from "@/lib/categories";

interface Props {
  serverError?: string | null;
  action?: string;
  initialName?: string;
  initialType?: CategoryType;
  initialLimit?: string;
  submitLabel?: string;
  pendingText?: string;
  onCancel?: () => void;
}

const TYPE_OPTIONS: { value: CategoryType; label: string; hint: string }[] = [
  { value: "recurring", label: "Recurring", hint: "Monthly" },
  { value: "irregular", label: "Irregular", hint: "Annual" },
];

export default function CategoryForm({
  serverError,
  action = "/api/categories",
  initialName = "",
  initialType = "recurring",
  initialLimit = "",
  submitLabel = "Add category",
  pendingText = "Adding...",
  onCancel,
}: Props) {
  const [name, setName] = useState(initialName);
  const [type, setType] = useState<CategoryType>(initialType);
  const [limit, setLimit] = useState(initialLimit);
  const [errors, setErrors] = useState<{ name?: string; limit?: string }>({});

  const limitLabel = type === "recurring" ? "Monthly limit (PLN)" : "Annual limit (PLN)";
  const SubmitIcon = submitLabel === "Add category" ? <FolderPlus className="size-4" /> : <Save className="size-4" />;

  function validate() {
    const next: typeof errors = {};
    const trimmed = name.trim();
    if (!trimmed) {
      next.name = "Category name is required";
    } else if (trimmed.toLowerCase() === SYSTEM_OTHER_NAME.toLowerCase()) {
      next.name = `"${SYSTEM_OTHER_NAME}" is a reserved name`;
    }
    const parsed = parsePlnToCents(limit);
    if ("error" in parsed) {
      next.limit = parsed.error;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action={action} className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="name"
        label="Name"
        value={name}
        onChange={(v) => {
          setName(v);
          clearError("name");
        }}
        placeholder="e.g. Groceries"
        error={errors.name}
        icon={<Tag className="size-4" />}
      />

      <div>
        <span className="mb-1 block text-sm text-blue-100/80">Type</span>
        <div className="grid grid-cols-2 gap-2">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setType(opt.value);
              }}
              aria-pressed={type === opt.value}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center rounded-lg border px-3 py-2 text-sm transition-colors",
                type === opt.value
                  ? "border-purple-400 bg-purple-500/30 text-white"
                  : "border-white/20 bg-white/10 text-blue-100/80 hover:bg-white/20",
              )}
            >
              <span className="font-medium">{opt.label}</span>
              <span className="text-xs text-blue-100/60">{opt.hint} limit</span>
            </button>
          ))}
        </div>
        {/* Native value carried to the API route; the buttons above drive it. */}
        <input type="hidden" name="type" value={type} />
      </div>

      <FormField
        id="limit"
        label={limitLabel}
        type="text"
        value={limit}
        onChange={(v) => {
          setLimit(v);
          clearError("limit");
        }}
        placeholder="1500"
        error={errors.limit}
        icon={<Wallet className="size-4" />}
      />

      <ServerError message={serverError} />

      <div className={cn("flex gap-2", onCancel ? "flex-row" : "")}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-white/20 bg-white/10 py-2 text-sm text-blue-100/80 hover:bg-white/20"
          >
            Cancel
          </button>
        )}
        <div className={cn(onCancel ? "flex-1" : "w-full")}>
          <SubmitButton pendingText={pendingText} icon={SubmitIcon}>
            {submitLabel}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
