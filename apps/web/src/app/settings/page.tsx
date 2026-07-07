"use client";

import { TopBar } from "@/components/TopBar";
import { authClient, useSession } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [saving, setSaving] = useState(false);

  const utils = trpc.useUtils();
  const jobs = trpc.security.jobRuns.useQuery(undefined, { enabled: !!session?.user });
  const audit = trpc.security.auditLog.useQuery(undefined, { enabled: !!session?.user });
  const markChanged = trpc.security.markPasswordChanged.useMutation({
    onSuccess: () => utils.security.status.invalidate(),
  });

  const JOB_LABELS: Record<string, string> = {
    "recurring-generate": "排程產生",
    "fx-refresh": "匯率更新",
    "price-refresh": "股價更新",
    "net-worth-snapshot": "淨資產快照",
    "db-backup": "資料庫備份",
  };

  useEffect(() => {
    if (!isPending && !session?.user) router.replace("/login");
  }, [isPending, session, router]);

  if (isPending || !session?.user) {
    return (
      <>
        <TopBar />
        <div className="container muted">載入中…</div>
      </>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    if (next.length < 5) {
      setError("新密碼至少 5 碼");
      return;
    }
    if (next !== confirm) {
      setError("兩次輸入的新密碼不一致");
      return;
    }
    setSaving(true);
    const res = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    setSaving(false);
    if (res.error) {
      setError(res.error.message ?? "變更失敗，請確認目前密碼");
      return;
    }
    setOk(true);
    setCurrent("");
    setNext("");
    setConfirm("");
    markChanged.mutate();
  }

  return (
    <>
      <TopBar />
      <div className="container">
        <h2 style={{ marginTop: 0 }}>設定</h2>

        <div className="section-title">帳號</div>
        <div className="card">
          <div className="row" style={{ padding: 0, border: "none", background: "none" }}>
            <div className="meta">
              <span className="primary">{session.user.name || session.user.email}</span>
              <span className="secondary">使用者名稱：{session.user.username ?? "—"}</span>
            </div>
          </div>
        </div>

        <div className="section-title">變更密碼</div>
        <form className="card" onSubmit={submit}>
          <label>
            目前密碼
            <input
              type="password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label>
            新密碼
            <input
              type="password"
              required
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              placeholder="至少 5 碼"
            />
          </label>
          <label>
            確認新密碼
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          {error && <div className="error">{error}</div>}
          {ok && <div className="income" style={{ fontSize: 14 }}>密碼已更新，其他裝置的登入已登出。</div>}
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "更新中…" : "更新密碼"}
          </button>
        </form>

        <div className="section-title">背景工作</div>
        {!jobs.data?.length ? (
          <div className="muted">尚無執行紀錄（每日排程執行後會出現）。</div>
        ) : (
          <div className="list">
            {jobs.data.map((j) => (
              <div className="row" key={j.name}>
                <div className="meta">
                  <span className="primary">
                    {JOB_LABELS[j.name] ?? j.name}
                    <span
                      className={`badge ${j.status === "success" ? "income" : j.status === "error" ? "expense" : "muted-badge"}`}
                    >
                      {j.status === "success" ? "成功" : j.status === "error" ? "失敗" : j.status}
                    </span>
                  </span>
                  <span className="secondary">
                    {new Date(j.ranAt).toLocaleString("zh-TW")}
                    {j.message ? ` · ${j.message}` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {(audit.data?.length ?? 0) > 0 && (
          <>
            <div className="section-title">最近操作紀錄</div>
            <div className="list">
              {audit.data!.map((a) => (
                <div className="row" key={a.id}>
                  <div className="meta">
                    <span className="primary">
                      {a.action === "delete" ? "刪除" : a.action === "archive" ? "封存" : a.action}
                      {" · "}
                      {a.entity === "transaction" ? "交易" : a.entity === "account" ? "帳戶" : a.entity}
                    </span>
                    <span className="secondary">
                      {new Date(a.createdAt).toLocaleString("zh-TW")}
                      {a.summary ? ` · ${a.summary}` : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
