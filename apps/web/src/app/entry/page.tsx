"use client";

import { QuickEntry } from "@/components/QuickEntry";
import { TopBar } from "@/components/TopBar";
import { Skeleton, SkeletonList } from "@/components/Skeleton";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function EntryPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && !session?.user) router.replace("/login");
  }, [isPending, session, router]);

  if (isPending || !session?.user) {
    return (
      <>
        <TopBar />
        <div className="container">
          <Skeleton width={120} height={28} style={{ marginBottom: 20 }} />
          <SkeletonList rows={3} />
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar />
      <div className="container" style={{ maxWidth: 560 }}>
        <h2 style={{ marginTop: 0 }}>記錄</h2>
        <QuickEntry onDone={() => router.push("/")} />
      </div>
    </>
  );
}
