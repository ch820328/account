"use client";

import { Amount } from "@/components/Amount";
import { TopBar } from "@/components/TopBar";
import { useSession } from "@/lib/auth-client";
import { SUPPORTED_CURRENCIES } from "@/lib/labels";
import { trpc } from "@/lib/trpc";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const ASSET_SUBTYPES: { value: string; label: string }[] = [
  { value: "bank", label: "銀行" },
  { value: "cash", label: "現金" },
  { value: "broker", label: "證券" },
  { value: "wallet", label: "電子錢包" },
];

type AccountRow = {
  accountId: string;
  name: string;
  type: string;
  currency: string;
  balanceMinor: bigint;
  isLiability: boolean;
};

export default function AccountsPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const utils = trpc.useUtils();

  const accounts = trpc.accounts.listWithBalances.useQuery(undefined, {
    enabled: !!session?.user,
  });

  const [name, setName] = useState("");
  const [subtype, setSubtype] = useState("bank");
  const [currency, setCurrency] = useState("TWD");
  const [openingBalance, setOpeningBalance] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [balanceDraft, setBalanceDraft] = useState("");

  const invalidate = () =>
    Promise.all([
      utils.accounts.listWithBalances.invalidate(),
      utils.accounts.list.invalidate(),
      utils.netWorth.summary.invalidate(),
      utils.forecast.projection.invalidate(),
    ]);

  const create = trpc.accounts.create.useMutation({
    onSuccess: async () => {
      await invalidate();
      setName("");
      setOpeningBalance("");
      setError(null);
    },
    onError: (e) => setError(e.message),
  });

  const setBalance = trpc.accounts.setBalance.useMutation({
    onSuccess: async () => {
      await invalidate();
      setEditingId(null);
    },
  });

  const archive = trpc.accounts.archive.useMutation({ onSuccess: invalidate });

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

  const assetAccounts = ((accounts.data ?? []) as AccountRow[]).filter((a) => !a.isLiability);

  return (
    <>
      <TopBar />
      <div className="container">
        <h2 style={{ marginTop: 0 }}>帳戶</h2>
        <p className="muted" style={{ margin: "0 0 20px" }}>
          你的錢在哪裡：銀行、現金、證券等。點「更新餘額」隨時對帳。
          房貸等負債請到 <Link href="/schedule">排程 → 貸款還款</Link> 設定。
        </p>

        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            create.mutate({
              name,
              side: "asset",
              subtype,
              currency,
              openingBalance: openingBalance || undefined,
            });
          }}
        >
          <div className="grid cols-3">
            <label>
              名稱
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="台新薪轉" />
            </label>
            <label>
              類型
              <select value={subtype} onChange={(e) => setSubtype(e.target.value)}>
                {ASSET_SUBTYPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              幣別
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            目前餘額
            <input
              inputMode="decimal"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              placeholder="0"
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="btn" disabled={create.isPending}>
            {create.isPending ? "新增中…" : "新增帳戶"}
          </button>
        </form>

        <div className="section-title">我的帳戶</div>
        {accounts.isLoading ? (
          <div className="muted">載入中…</div>
        ) : !assetAccounts.length ? (
          <div className="muted">尚無帳戶。</div>
        ) : (
          <div className="list">
            {assetAccounts.map((a) => (
              <div className={`list-item${editingId === a.accountId ? " editing" : ""}`} key={a.accountId}>
                <div className="row">
                  <div className="meta">
                    <span className="primary">{a.name}</span>
                    <span className="secondary">{a.currency}</span>
                  </div>
                  <div className="row-inline">
                    <Amount value={a.balanceMinor} currency={a.currency} kind="income" />
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => {
                        setEditingId(editingId === a.accountId ? null : a.accountId);
                        setBalanceDraft(String(Number(a.balanceMinor) / 100));
                      }}
                    >
                      {editingId === a.accountId ? "收合" : "更新餘額"}
                    </button>
                    {editingId !== a.accountId && (
                      <>
                        <Link className="btn ghost" href={`/transactions?account=${a.accountId}`}>
                          明細
                        </Link>
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() => {
                            if (confirm(`封存「${a.name}」？`)) archive.mutate({ id: a.accountId });
                          }}
                        >
                          封存
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {editingId === a.accountId && (
                  <div className="row-edit-panel">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        setBalance.mutate({ id: a.accountId, balance: balanceDraft });
                      }}
                    >
                      <label>
                        目前餘額（{a.currency}）
                        <input
                          autoFocus
                          inputMode="decimal"
                          value={balanceDraft}
                          onChange={(e) => setBalanceDraft(e.target.value)}
                        />
                      </label>
                      <div className="row-inline">
                        <button className="btn" type="submit" disabled={setBalance.isPending}>
                          {setBalance.isPending ? "更新中…" : "儲存餘額"}
                        </button>
                        <button type="button" className="btn ghost" onClick={() => setEditingId(null)}>
                          取消
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
