import { CATEGORY_KINDS, categories } from "@acc/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

export const categoriesRouter = router({
  list: protectedProcedure
    .input(z.object({ kind: z.enum(CATEGORY_KINDS).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const where = input?.kind
        ? and(eq(categories.userId, ctx.user.id), eq(categories.kind, input.kind))
        : eq(categories.userId, ctx.user.id);
      return ctx.db.select().from(categories).where(where).orderBy(categories.name);
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
});
