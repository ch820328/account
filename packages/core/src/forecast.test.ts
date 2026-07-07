import { describe, expect, it } from "vitest";
import { parseCategoryIds } from "./forecast";

describe("parseCategoryIds", () => {
  it("returns null when empty / nullish", () => {
    expect(parseCategoryIds(null)).toBeNull();
    expect(parseCategoryIds(undefined)).toBeNull();
    expect(parseCategoryIds("")).toBeNull();
    expect(parseCategoryIds("  ,  ")).toBeNull();
  });

  it("parses a comma-separated list into a set", () => {
    const set = parseCategoryIds("a, b ,c");
    expect(set).not.toBeNull();
    expect([...set!].sort()).toEqual(["a", "b", "c"]);
  });
});
