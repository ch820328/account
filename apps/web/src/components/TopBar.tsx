"use client";

import { signOut, useSession } from "@/lib/auth-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function TopBar() {
  const { data: session } = useSession();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [gearOpen, setGearOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const gearRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
      if (gearRef.current && !gearRef.current.contains(e.target as Node)) setGearOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="topbar">
      <Link href="/" className="brand">
        記帳
      </Link>
      <div className="nav">
        <Link href="/">首頁</Link>
        <Link href="/entry">記錄</Link>
        <Link href="/transactions">交易</Link>
        <Link href="/schedule">排程</Link>
        <Link href="/accounts">帳戶</Link>
        <div className="nav-dropdown" ref={moreRef}>
          <button
            type="button"
            className="nav-dropdown-trigger"
            onClick={() => {
              setMoreOpen((v) => !v);
              setGearOpen(false);
            }}
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
              <Link href="/reports" onClick={() => setMoreOpen(false)}>
                報表
              </Link>
              <Link href="/holdings" onClick={() => setMoreOpen(false)}>
                投資持倉
              </Link>
              <Link href="/lending" onClick={() => setMoreOpen(false)}>
                借款
              </Link>
            </div>
          )}
        </div>

        <div className="nav-dropdown" ref={gearRef}>
          <button
            type="button"
            className="gear-trigger"
            onClick={() => {
              setGearOpen((v) => !v);
              setMoreOpen(false);
            }}
            aria-label="設定"
            aria-expanded={gearOpen}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          {gearOpen && (
            <div className="nav-dropdown-menu">
              <Link href="/categories" onClick={() => setGearOpen(false)}>
                分類管理
              </Link>
              <Link href="/accounts" onClick={() => setGearOpen(false)}>
                帳戶管理
              </Link>
              <Link href="/settings" onClick={() => setGearOpen(false)}>
                帳號設定
              </Link>
              {session?.user && (
                <button
                  type="button"
                  className="nav-dropdown-item-btn"
                  onClick={async () => {
                    setGearOpen(false);
                    await signOut();
                    router.push("/login");
                    router.refresh();
                  }}
                >
                  登出
                </button>
              )}
            </div>
          )}
        </div>

        {!session?.user && <Link href="/login">登入</Link>}
      </div>
    </div>
  );
}
