import { attachments, transactions, accounts } from "@acc/db";
import { TRPCError } from "@trpc/server";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import fs from "node:fs/promises";
import path from "node:path";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

export const attachmentsRouter = router({
  list: protectedProcedure
    .input(z.object({ transactionId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(attachments.userId, ctx.user.id)];
      if (input?.transactionId) {
        conditions.push(eq(attachments.transactionId, input.transactionId));
      }
      return ctx.db
        .select({
          id: attachments.id,
          userId: attachments.userId,
          transactionId: attachments.transactionId,
          filename: attachments.filename,
          fileKey: attachments.fileKey,
          contentType: attachments.contentType,
          sizeBytes: attachments.sizeBytes,
          note: attachments.note,
          createdAt: attachments.createdAt,
          txOccurredAt: transactions.occurredAt,
          txAmountMinor: transactions.amountMinor,
          txCurrency: transactions.currency,
          txType: transactions.type,
          txNote: transactions.note,
          txAccountName: accounts.name,
        })
        .from(attachments)
        .leftJoin(transactions, eq(attachments.transactionId, transactions.id))
        .leftJoin(accounts, eq(transactions.accountId, accounts.id))
        .where(and(...conditions))
        .orderBy(desc(attachments.createdAt));
    }),

  link: protectedProcedure
    .input(
      z.object({
        attachmentId: z.string().uuid(),
        transactionId: z.string().uuid().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(attachments)
        .set({ transactionId: input.transactionId })
        .where(and(eq(attachments.id, input.attachmentId), eq(attachments.userId, ctx.user.id)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "找不到附件" });
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(attachments)
        .where(and(eq(attachments.id, input.id), eq(attachments.userId, ctx.user.id)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "找不到附件" });

      // Remove physical file safely
      try {
        const filePath = path.join(UPLOAD_DIR, existing.fileKey);
        await fs.unlink(filePath);
      } catch (err) {
        console.warn("Could not remove physical file:", err);
      }

      const [deleted] = await ctx.db
        .delete(attachments)
        .where(and(eq(attachments.id, input.id), eq(attachments.userId, ctx.user.id)))
        .returning();
      return deleted;
    }),
});
