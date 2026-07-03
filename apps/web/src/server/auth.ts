import { seedNewUser } from "@acc/core";
import { account, db, session, user, verification } from "@acc/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
import { getTrustedOrigins } from "@/lib/trusted-origins";

const SESSION_EXPIRES_SECONDS =
  Number(process.env.SESSION_EXPIRES_DAYS ?? 7) * 24 * 60 * 60;
/** Sliding window: extend expiresAt to now + expiresIn when session is used after this idle gap. */
const SESSION_UPDATE_SECONDS = Number(process.env.SESSION_UPDATE_MINUTES ?? 15) * 60;

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  trustedOrigins: getTrustedOrigins(),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  session: {
    expiresIn: SESSION_EXPIRES_SECONDS,
    updateAge: SESSION_UPDATE_SECONDS,
    // Keep false (default): DB-backed sliding refresh on each getSession after updateAge.
    disableSessionRefresh: false,
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 5,
  },
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 32,
      usernameValidator: (u) => /^[a-zA-Z0-9_-]+$/.test(u),
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (created) => {
          // Give every new account starter categories + a default cash account.
          await seedNewUser(db, created.id);
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
