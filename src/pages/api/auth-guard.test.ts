import { describe, it, expect, vi } from "vitest";
import type { APIRoute } from "astro";

vi.mock("astro:env/server", () => ({
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_KEY: "test-anon-key",
}));

function makeContext(): Parameters<APIRoute>[0] {
  return {
    request: new Request("http://localhost/api/test", { method: "POST" }),
    cookies: {
      get: () => undefined,
      getAll: () => [],
      has: () => false,
      set: vi.fn(),
      delete: vi.fn(),
    },
    locals: { user: null },
    params: { id: "00000000-0000-0000-0000-000000000000" },
    redirect: (path: string) => new Response(null, { status: 302, headers: { Location: path } }),
  } as unknown as Parameters<APIRoute>[0];
}

const ENDPOINTS = [
  { name: "categories/index", importPath: "@/pages/api/categories/index" },
  { name: "categories/[id]", importPath: "@/pages/api/categories/[id]" },
  { name: "categories/[id]/delete", importPath: "@/pages/api/categories/[id]/delete" },
  { name: "expenses/index", importPath: "@/pages/api/expenses/index" },
  { name: "expenses/[id]", importPath: "@/pages/api/expenses/[id]" },
] as const;

describe("Auth guard — all gated POST endpoints", () => {
  it.each(ENDPOINTS)("$name: redirects unauthenticated request to /auth/signin", async ({ importPath }) => {
    const mod = (await import(importPath)) as { POST: APIRoute };
    const res = await mod.POST(makeContext());
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/auth/signin");
  });
});
