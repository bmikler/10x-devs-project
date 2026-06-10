import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import CategoryForm from "@/components/categories/CategoryForm";
import { formatCentsToPln } from "@/lib/money";
import { type CategoryType } from "@/lib/categories";

interface CategoryRow {
  id: string;
  name: string;
  type: string;
  limit_cents: number | null;
  is_system: boolean;
}

interface Props {
  categories: CategoryRow[];
}

type RowMode = "idle" | "editing" | "confirming";

function typeLabel(type: string) {
  return type === "recurring" ? "Monthly" : "Annual";
}

function centsToInputString(cents: number): string {
  return (cents / 100).toFixed(2).replace(/\.?0+$/, "");
}

export default function CategoryList({ categories }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<RowMode>("idle");

  function openEdit(id: string) {
    setActiveId(id);
    setMode("editing");
  }

  function openConfirm(id: string) {
    setActiveId(id);
    setMode("confirming");
  }

  function reset() {
    setActiveId(null);
    setMode("idle");
  }

  return (
    <ul className="mb-6 flex flex-col gap-3">
      {categories.map((category) => {
        const isActive = activeId === category.id;

        if (category.is_system) {
          return (
            <li
              key={category.id}
              className="flex items-center gap-3 rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4 text-white"
            >
              <span className="text-2xl">🗂️</span>
              <div className="flex-1">
                <div className="font-semibold text-amber-100">{category.name}</div>
                <div className="text-xs text-amber-100/70">Catch-all · auto-managed</div>
              </div>
            </li>
          );
        }

        if (isActive && mode === "editing") {
          return (
            <li
              key={category.id}
              className="rounded-2xl border border-purple-400/30 bg-white/10 p-4 text-white backdrop-blur-xl"
            >
              <CategoryForm
                action={`/api/categories/${category.id}`}
                initialName={category.name}
                initialType={category.type as CategoryType}
                initialLimit={category.limit_cents !== null ? centsToInputString(category.limit_cents) : ""}
                submitLabel="Save"
                pendingText="Saving..."
                onCancel={reset}
              />
            </li>
          );
        }

        if (isActive && mode === "confirming") {
          return (
            <li
              key={category.id}
              className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-white backdrop-blur-xl"
            >
              <p className="mb-4 text-sm text-red-100">
                Delete <span className="font-semibold">«{category.name}»</span>? Its expenses will move to other.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className="flex-1 rounded-lg border border-white/20 bg-white/10 py-2 text-sm text-blue-100/80 hover:bg-white/20"
                >
                  Cancel
                </button>
                <form method="POST" action={`/api/categories/${category.id}/delete`} className="flex-1">
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-500"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </li>
          );
        }

        return (
          <li
            key={category.id}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 p-4 text-white backdrop-blur-xl"
          >
            <span className="text-2xl">📁</span>
            <div className="flex-1">
              <div className="font-semibold">{category.name}</div>
              <div className="text-xs text-blue-100/70">{typeLabel(category.type)}</div>
            </div>
            {category.limit_cents !== null && (
              <div className="text-right text-sm font-medium text-blue-100">
                {formatCentsToPln(category.limit_cents)}
              </div>
            )}
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => {
                  openEdit(category.id);
                }}
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-blue-100/80 hover:bg-white/20"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  openConfirm(category.id);
                }}
                className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-200 hover:bg-red-500/20"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
