import { describe, it, expect } from "vitest";
import { buildReport } from "@/lib/report";

describe("buildReport", () => {
  it("is a function (alias resolution sanity check)", () => {
    expect(typeof buildReport).toBe("function");
  });
});
