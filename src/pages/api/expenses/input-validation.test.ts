import { describe, it, expect, vi } from "vitest";
import type { APIRoute } from "astro";

vi.mock("astro:env/server", () => ({
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_KEY: "test-anon-key",
}));

import { POST } from "@/pages/api/expenses/index";

function makeContext(form: FormData): Parameters<APIRoute>[0] {
  return {
    request: new Request("http://localhost/api/expenses", { method: "POST", body: form }),
    cookies: {
      get: () => undefined,
      getAll: () => [],
      has: () => false,
      set: vi.fn(),
      delete: vi.fn(),
    },
    locals: { user: { id: "test-user-id" } },
    params: {},
    redirect: (path: string) => new Response(null, { status: 302, headers: { Location: path } }),
  } as unknown as Parameters<APIRoute>[0];
}

function validForm(): FormData {
  const form = new FormData();
  form.set("amount", "10.00");
  form.set("category_id", "00000000-0000-0000-0000-000000000001");
  form.set("date", "2026-06-01");
  return form;
}

describe("Input validation — expense POST endpoint", () => {
  it("missing amount → 302 to /expenses?error=", async () => {
    const form = validForm();
    form.delete("amount");
    const res = await POST(makeContext(form));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toMatch(/^\/expenses\?error=/);
  });

  it("zero amount → 302 to /expenses?error=", async () => {
    const form = validForm();
    form.set("amount", "0");
    const res = await POST(makeContext(form));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toMatch(/^\/expenses\?error=/);
  });

  it("negative amount → 302 to /expenses?error=", async () => {
    const form = validForm();
    form.set("amount", "-1");
    const res = await POST(makeContext(form));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toMatch(/^\/expenses\?error=/);
  });

  it("non-numeric amount → 302 to /expenses?error=", async () => {
    const form = validForm();
    form.set("amount", "abc");
    const res = await POST(makeContext(form));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toMatch(/^\/expenses\?error=/);
  });

  it("missing category_id → 302 to /expenses?error=", async () => {
    const form = validForm();
    form.delete("category_id");
    const res = await POST(makeContext(form));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toMatch(/^\/expenses\?error=/);
  });

  it("future date → 302 to /expenses?error=", async () => {
    const form = validForm();
    form.set("date", "2099-01-01");
    const res = await POST(makeContext(form));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toMatch(/^\/expenses\?error=/);
  });
});
