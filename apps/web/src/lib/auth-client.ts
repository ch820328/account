"use client";

import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

/** Same-origin in the browser so Docker / custom ports work without a rebuild. */
function authBaseURL(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

export const authClient = createAuthClient({
  baseURL: authBaseURL(),
  plugins: [usernameClient()],
  session: {
    refetchOnWindowFocus: true,
  },
});

export const { signIn, signUp, signOut, useSession } = authClient;
