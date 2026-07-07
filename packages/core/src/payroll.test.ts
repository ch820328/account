import { describe, expect, it } from "vitest";
import { sumPayrollLines } from "./payroll";

describe("sumPayrollLines", () => {
  it("nets earnings minus deductions", () => {
    const totals = sumPayrollLines([
      { kind: "earning", amountMinor: 19000000n },
      { kind: "earning", amountMinor: 0n },
      { kind: "deduction", amountMinor: 95000n },
      { kind: "deduction", amountMinor: 114500n },
      { kind: "deduction", amountMinor: 564600n },
      { kind: "deduction", amountMinor: 950000n },
    ]);
    expect(totals.earningsMinor).toBe(19000000n);
    expect(totals.deductionsMinor).toBe(1724100n);
    expect(totals.netMinor).toBe(17275900n);
  });

  it("handles an empty payslip", () => {
    const totals = sumPayrollLines([]);
    expect(totals).toEqual({ earningsMinor: 0n, deductionsMinor: 0n, netMinor: 0n });
  });
});
