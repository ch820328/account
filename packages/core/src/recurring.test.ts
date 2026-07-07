import { describe, expect, it } from "vitest";
import { advanceRecurringDate, initialNextRunDate } from "./recurring";

describe("advanceRecurringDate", () => {
  it("advances monthly keeping day of month", () => {
    expect(
      advanceRecurringDate("2026-01-15", {
        frequency: "monthly",
        interval: 1,
        dayOfMonth: 15,
        weekday: null,
      }),
    ).toBe("2026-02-15");
  });

  it("respects a multi-month interval", () => {
    expect(
      advanceRecurringDate("2026-01-15", {
        frequency: "monthly",
        interval: 2,
        dayOfMonth: 15,
        weekday: null,
      }),
    ).toBe("2026-03-15");
  });

  it("clamps to the last day of a short month without overflowing", () => {
    expect(
      advanceRecurringDate("2026-01-31", {
        frequency: "monthly",
        interval: 1,
        dayOfMonth: 31,
        weekday: null,
      }),
    ).toBe("2026-02-28");
    expect(
      advanceRecurringDate("2026-02-28", {
        frequency: "monthly",
        interval: 1,
        dayOfMonth: 31,
        weekday: null,
      }),
    ).toBe("2026-03-31");
  });

  it("advances daily / yearly", () => {
    expect(
      advanceRecurringDate("2026-01-01", {
        frequency: "daily",
        interval: 10,
        dayOfMonth: null,
        weekday: null,
      }),
    ).toBe("2026-01-11");
    expect(
      advanceRecurringDate("2026-01-01", {
        frequency: "yearly",
        interval: 1,
        dayOfMonth: null,
        weekday: null,
      }),
    ).toBe("2027-01-01");
  });
});

describe("initialNextRunDate", () => {
  it("returns this month if day not yet passed", () => {
    expect(
      initialNextRunDate("2026-03-05", {
        frequency: "monthly",
        interval: 1,
        dayOfMonth: 25,
        weekday: null,
      }),
    ).toBe("2026-03-25");
  });

  it("rolls to next month if day already passed", () => {
    expect(
      initialNextRunDate("2026-03-26", {
        frequency: "monthly",
        interval: 1,
        dayOfMonth: 25,
        weekday: null,
      }),
    ).toBe("2026-04-25");
  });
});
