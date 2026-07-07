import { auditLog, jobRuns, user } from "@acc/db";
import { desc, eq } from "drizzle-orm";
import { protectedProcedure, router } from "../trpc";

function defaultAdminUsername(): string {
  return (process.env.ADMIN_USERNAME ?? "admin").toLowerCase();
}

export const securityRouter = router({
  /** Whether the seeded admin is still on the default password. */
  status: protectedProcedure.query(async ({ ctx }) => {
    const [u] = await ctx.db
      .select({ username: user.username, passwordChangedAt: user.passwordChangedAt })
      .from(user)
      .where(eq(user.id, ctx.user.id))
      .limit(1);

    const needsPasswordChange =
      !!u &&
      u.passwordChangedAt == null &&
      (u.username ?? "").toLowerCase() === defaultAdminUsername();

    return { needsPasswordChange };
  }),

  markPasswordChanged: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(user)
      .set({ passwordChangedAt: new Date() })
      .where(eq(user.id, ctx.user.id));
    return { ok: true };
  }),

  /** Latest run of each background worker job (health surfacing). */
  jobRuns: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(jobRuns).orderBy(desc(jobRuns.ranAt));
  }),

  auditLog: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.userId, ctx.user.id))
      .orderBy(desc(auditLog.createdAt))
      .limit(30);
  }),
});
