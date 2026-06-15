import { describe, it, expect } from "vitest";
import { getExpenseCutoff } from "@/lib/budget-year";

describe("getExpenseCutoff", () => {
  it("mid-year (June): returns July 1", () => {
    expect(getExpenseCutoff(2026, 6)).toBe("2026-07-01");
  });

  it("November: returns December 1", () => {
    expect(getExpenseCutoff(2026, 11)).toBe("2026-12-01");
  });

  it("December: wraps to January 1 of next year", () => {
    expect(getExpenseCutoff(2026, 12)).toBe("2027-01-01");
  });

  it("January: returns February 1", () => {
    expect(getExpenseCutoff(2026, 1)).toBe("2026-02-01");
  });
});
