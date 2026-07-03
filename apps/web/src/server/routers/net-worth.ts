import { computeNetWorth } from "@acc/core";
import { protectedProcedure, router } from "../trpc";

export const netWorthRouter = router({
  summary: protectedProcedure.query(async ({ ctx }) => {
    return computeNetWorth(ctx.db, ctx.user.id);
  }),
});
