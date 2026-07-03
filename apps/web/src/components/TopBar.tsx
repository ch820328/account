"use client";

import { signOut, useSession } from "@/lib/auth-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function TopBar() {
  const { data: session } = useSession();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="topbar">
      <Link href="/" className="brand">
        記帳
      </Link>
      <div className="nav">
        <Link href="/">首頁</Link>
        <Link href="/entry">記一筆</Link>
        <Link href="/schedule">排程</Link>
        <Link href="/accounts">帳戶</Link>
        <div className="nav-dropdown">
          <button
            type="button"
            className="nav-dropdown-trigger"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
          >
            更多 ▾
          </button>
          {moreOpen && (
            <div className="nav-dropdown-menu">
              <Link href="/forecast" onClick={() => setMoreOpen(false)}>
                資產預估
              </Link>
              <Link href="/net-worth" onClick={() => setMoreOpen(false)}>
                淨資產
              </Link>
              <Link href="/holdings" onClick={() => setMoreOpen(false)}>
                投資持倉
              </Link>
              <Link href="/categories" onClick={() => setMoreOpen(false)}>
                分類管理
              </Link>
            </div>
          )}
        </div>
        {session?.user ? (
          <button
            className="btn ghost"
            onClick={async () => {
              await signOut();
              router.push("/login");
              router.refresh();
            }}
          >
            登出
          </button>
        ) : (
          <Link href="/login">登入</Link>
        )}
      </div>
    </div>
  );
}
