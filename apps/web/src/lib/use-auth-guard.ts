"use client";

import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Redirects to /login when unauthenticated. Returns `{ ready, session }`
 * where `ready` is true once a logged-in session is confirmed — pages render
 * their loading state until then. Dedupes the guard boilerplate every page
 * previously repeated.
 */
export function useAuthGuard() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && !session?.user) router.replace("/login");
  }, [isPending, session, router]);

  return { ready: !isPending && !!session?.user, session, isPending };
}
