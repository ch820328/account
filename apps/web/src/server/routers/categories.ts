import { CATEGORY_KINDS, categories, transactions } from "@acc/db";
import { seedMissingDefaultCategories } from "@acc/core";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

export const categoriesRouter = router({
  list: protectedProcedure
    .input(z.object({ kind: z.enum(CATEGORY_KINDS).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const where = input?.kind
        ? and(eq(categories.userId, ctx.user.id), eq(categories.kind, input.kind))
        : eq(categories.userId, ctx.user.id);
      return ctx.db.select().from(categories).where(where).orderBy(asc(categories.sortOrder), asc(categories.name));
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80),
        kind: z.enum(CATEGORY_KINDS),
        parentId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(categories)
        .values({
          userId: ctx.user.id,
          name: input.name,
          kind: input.kind,
          parentId: input.parentId,
        })
        .returning();
      return created;
    }),

  /** Backfill any missing default category groups for an existing user. */
  seedDefaults: protectedProcedure.mutation(async ({ ctx }) => {
    return seedMissingDefaultCategories(ctx.db, ctx.user.id);
  }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(80).optional(),
        parentId: z.string().uuid().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const setData: Record<string, any> = {};
      if (input.name !== undefined) setData.name = input.name;
      if (input.parentId !== undefined) setData.parentId = input.parentId;

      const [updated] = await ctx.db
        .update(categories)
        .set(setData)
        .where(and(eq(categories.id, input.id), eq(categories.userId, ctx.user.id)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "找不到分類" });
      return updated;
    }),

  updateSort: protectedProcedure
    .input(
      z.array(
        z.object({
          id: z.string().uuid(),
          sortOrder: z.number().int(),
        })
      )
    )
    .mutation(async ({ ctx, input }) => {
      // Execute in a transaction since it's a batch update
      await ctx.db.transaction(async (tx) => {
        for (const item of input) {
          await tx
            .update(categories)
            .set({ sortOrder: item.sortOrder })
            .where(and(eq(categories.id, item.id), eq(categories.userId, ctx.user.id)));
        }
      });
      return { success: true };
    }),

  batchSaveTree: protectedProcedure
    .input(
      z.array(
        z.object({
          id: z.string().uuid(),
          name: z.string().min(1).max(80),
          parentId: z.string().uuid().nullable(),
          sortOrder: z.number().int(),
        })
      )
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        for (const item of input) {
          await tx
            .update(categories)
            .set({
              name: item.name,
              parentId: item.parentId,
              sortOrder: item.sortOrder,
            })
            .where(and(eq(categories.id, item.id), eq(categories.userId, ctx.user.id)));
        }
      });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Count transactions still using this category so the UI can warn.
      const [used] = await ctx.db
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(eq(transactions.categoryId, input.id), eq(transactions.userId, ctx.user.id)),
        )
        .limit(1);

      const [deleted] = await ctx.db
        .delete(categories)
        .where(and(eq(categories.id, input.id), eq(categories.userId, ctx.user.id)))
        .returning();
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "找不到分類" });
      // Related transactions keep their history; categoryId is set null by FK.
      return { ...deleted, hadTransactions: !!used };
    }),
});
