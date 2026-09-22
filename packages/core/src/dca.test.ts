import { describe, expect, it, vi } from "vitest";
import { generateDueDcaInvestments } from "./dca";
import type { Database } from "@acc/db";

describe("generateDueDcaInvestments", () => {
  it("returns zeros when no schedules are due", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as unknown as Database;

    const result = await generateDueDcaInvestments(mockDb, "2026-07-18");
    expect(result).toEqual({ processed: 0, created: 0 });
  });
});
