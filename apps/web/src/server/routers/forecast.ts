import {
  computeAssetForecast,
  syncLivingExpenseFromLedger,
  updateForecastSettings,
  upsertLivingEstimate,
} from "@acc/core";
import { fromDecimal } from "@acc/money";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

const decimal = z.string().regex(/^\d+(\.\d+)?$/, "金額格式不正確");
const monthKey = z.string().regex(/^\d{4}-\d{2}$/);

export const forecastRouter = router({
  projection: protectedProcedure.query(async ({ ctx }) => {
    return computeAssetForecast(ctx.db, ctx.user.id);
  }),

  updateSettings: protectedProcedure
    .input(
      z.object({
        defaultLivingExpense: decimal.optional(),
        horizonMonths: z.number().int().min(3).max(60).optional(),
        livingExpenseCategoryIds: z.array(z.string().uuid()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const base = await computeAssetForecast(ctx.db, ctx.user.id);
      const patch: Parameters<typeof updateForecastSettings>[2] = {};
      if (input.defaultLivingExpense != null) {
        patch.defaultLivingExpenseMinor = fromDecimal(
          input.defaultLivingExpense,
          base.baseCurrency,
        ).amount;
      }
      if (input.horizonMonths != null) patch.horizonMonths = input.horizonMonths;
      if (input.livingExpenseCategoryIds != null) {
        patch.livingExpenseCategoryIds = input.livingExpenseCategoryIds.length
          ? input.livingExpenseCategoryIds.join(",")
          : null;
      }
      await updateForecastSettings(ctx.db, ctx.user.id, patch);
      return computeAssetForecast(ctx.db, ctx.user.id);
    }),

  setLivingEstimate: protectedProcedure
    .input(z.object({ month: monthKey, amount: decimal }))
    .mutation(async ({ ctx, input }) => {
      const base = await computeAssetForecast(ctx.db, ctx.user.id);
      const amountMinor = fromDecimal(input.amount, base.baseCurrency).amount;
      await upsertLivingEstimate(ctx.db, ctx.user.id, input.month, amountMinor);
      return computeAssetForecast(ctx.db, ctx.user.id);
    }),

  syncLivingActual: protectedProcedure
    .input(z.object({ month: monthKey }))
    .mutation(async ({ ctx, input }) => {
      await syncLivingExpenseFromLedger(ctx.db, ctx.user.id, input.month);
      return computeAssetForecast(ctx.db, ctx.user.id);
    }),
});
