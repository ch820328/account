"use client";

import { useState } from "react";
import { Amount } from "@/components/Amount";
import { CreditCardPayModal } from "@/components/CreditCardPayModal";
import Link from "next/link";

type Account = {
  id?: string;
  parentId?: string | null;
  name: string;
  type: string;
  currency: string;
  balanceMinor?: bigint;
};

type DashboardAccountOverviewProps = {
  accounts: Account[];
};

export function DashboardAccountOverview({ accounts }: DashboardAccountOverviewProps) {
  const [payModalCard, setPayModalCard] = useState<Account | null>(null);

  // 定義常見金融機構關鍵字與配對規則
  const knownBanks = [
    { key: "ctbc", label: "中國信託", keywords: ["中國信託", "中信"] },
    { key: "fubon", label: "台北富邦", keywords: ["台北富邦", "富邦"] },
    { key: "huanan", label: "華南銀行", keywords: ["華南銀行", "華南"] },
    { key: "cathay", label: "國泰世華", keywords: ["國泰世華", "國泰"] },
    { key: "esun", label: "玉山銀行", keywords: ["玉山銀行", "玉山"] },
    { key: "taishin", label: "台新銀行", keywords: ["台新銀行", "台新"] },
    { key: "sinopac", label: "永豐銀行", keywords: ["永豐銀行", "永豐"] },
    { key: "megabank", label: "兆豐銀行", keywords: ["兆豐銀行", "兆豐"] },
    { key: "first", label: "第一銀行", keywords: ["第一銀行", "第一"] },
    { key: "land", label: "土地銀行", keywords: ["土地銀行", "土銀"] },
  ];

  // 1. 整理金融機構關聯樹
  const bankGroups: {
    key: string;
    label: string;
    assets: Account[];
    credits: Account[];
    loans: Account[];
  }[] = [];

  const assignedAccountIds = new Set<string>();

  for (const b of knownBanks) {
    const matchedAssets = accounts.filter(
      (a) => ["bank"].includes(a.type) && b.keywords.some((kw) => a.name.includes(kw))
    );
    const assetIds = new Set(matchedAssets.map((a) => a.id).filter(Boolean));

    const matchedCredits = accounts.filter(
      (a) =>
        a.type === "credit" &&
        ((a.parentId && assetIds.has(a.parentId)) ||
          (!a.parentId && b.keywords.some((kw) => a.name.includes(kw))))
    );
    const matchedLoans = accounts.filter(
      (a) =>
        ["loan", "mortgage"].includes(a.type) &&
        ((a.parentId && assetIds.has(a.parentId)) ||
          (!a.parentId && b.keywords.some((kw) => a.name.includes(kw))))
    );

    if (matchedAssets.length > 0 || matchedCredits.length > 0 || matchedLoans.length > 0) {
      matchedAssets.forEach((a) => a.id && assignedAccountIds.add(a.id));
      matchedCredits.forEach((a) => a.id && assignedAccountIds.add(a.id));
      matchedLoans.forEach((a) => a.id && assignedAccountIds.add(a.id));

      bankGroups.push({
        key: b.key,
        label: b.label,
        assets: matchedAssets,
        credits: matchedCredits,
        loans: matchedLoans,
      });
    }
  }

  // 2. 獨立帳戶（現金、電子錢包與無指定機構貸款）
  const standaloneAssets = accounts.filter(
    (a) => ["cash", "wallet", "bank"].includes(a.type) && (!a.id || !assignedAccountIds.has(a.id))
  );
  const standaloneCredits = accounts.filter(
    (a) => a.type === "credit" && (!a.id || !assignedAccountIds.has(a.id))
  );
  const standaloneLoans = accounts.filter(
    (a) => ["loan", "mortgage"].includes(a.type) && (!a.id || !assignedAccountIds.has(a.id))
  );

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: "bold", display: "flex", alignItems: "center", gap: 8 }}>
            <span>🌳</span> 金融機構與帳戶關聯樹狀視圖
          </h3>
          <Link href="/accounts" style={{ fontSize: 13, color: "var(--accent)", fontWeight: "600" }}>
            管理與調整帳戶 ➔
          </Link>
        </div>

        {/* 雙欄 / 多欄外框網格 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 }}>
          
          {/* 金融機構關聯樹 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {bankGroups.map((group) => (
              <div
                key={group.key}
                className="ff3-card"
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 10,
                  padding: 16,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                }}
              >
                {/* 銀行機構 Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 15, fontWeight: "bold", color: "var(--fg)", display: "flex", alignItems: "center", gap: 6 }}>
                    <span>🏦</span>
                    <span>{group.label}</span>
                  </div>
                  <span style={{ fontSize: 11, padding: "2px 8px", background: "rgba(79, 140, 255, 0.15)", color: "#60a5fa", borderRadius: 12, fontWeight: "500" }}>
                    金融體系
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {group.assets.map((bankAcc) => {
                    // 尋找綁定至或對應此特定銀行帳戶的信用卡與貸款
                    const childCredits = group.credits.filter(
                      (c) =>
                        c.parentId === bankAcc.id ||
                        (!c.parentId && c.currency === bankAcc.currency)
                    );
                    const childLoans = group.loans.filter(
                      (l) =>
                        l.parentId === bankAcc.id ||
                        (!l.parentId && l.currency === bankAcc.currency)
                    );

                    // 標記已渲染的 ID 防止重複
                    childCredits.forEach((c) => c.id && assignedAccountIds.add(c.id + "_rendered"));
                    childLoans.forEach((l) => l.id && assignedAccountIds.add(l.id + "_rendered"));

                    return (
                      <div key={bankAcc.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {/* 主銀行資產帳戶列（持有存款維持純白色 var(--fg)） */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 6 }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{bankAcc.name}</div>
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>銀行活存 • {bankAcc.currency}</div>
                          </div>
                          <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 14, color: "var(--fg)" }}>
                            <Amount value={bankAcc.balanceMinor ?? 0n} currency={bankAcc.currency} />
                          </div>
                        </div>

                        {/* 直屬信用卡（精準巢狀掛載於該銀行帳戶正下方 ↳，金額強制紅色 kind="expense"） */}
                        {childCredits.map((acc) => (
                          <div
                            key={acc.id}
                            style={{
                              marginLeft: 16,
                              padding: "8px 12px",
                              background: "rgba(239, 68, 68, 0.06)",
                              borderLeft: "3px solid var(--expense)",
                              borderRadius: "0 6px 6px 0",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              flexWrap: "wrap",
                              gap: 8,
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--fg)", display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ color: "var(--muted)" }}>↳ 💳</span>
                                <span>{acc.name}</span>
                              </div>
                              <div style={{ fontSize: 10, color: "var(--muted)", marginLeft: 16 }}>未結清卡費</div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13 }}>
                                <Amount value={acc.balanceMinor ?? 0n} currency={acc.currency} kind="expense" />
                              </div>
                              <button
                                type="button"
                                className="btn sm"
                                style={{ fontSize: 10, padding: "3px 7px", background: "rgba(79, 140, 255, 0.2)", color: "#60a5fa", border: "none", borderRadius: 4 }}
                                onClick={() => setPayModalCard(acc)}
                              >
                                🏦 結清卡費
                              </button>
                            </div>
                          </div>
                        ))}

                        {/* 直屬房貸與信貸（精準巢狀掛載於該銀行帳戶正下方 ↳，金額強制紅色 kind="expense"） */}
                        {childLoans.map((acc) => (
                          <div
                            key={acc.id}
                            style={{
                              marginLeft: 16,
                              padding: "8px 12px",
                              background: "rgba(245, 158, 11, 0.06)",
                              borderLeft: "3px solid #f59e0b",
                              borderRadius: "0 6px 6px 0",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--fg)", display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ color: "var(--muted)" }}>↳ 🏠</span>
                                <span>{acc.name}</span>
                              </div>
                              <div style={{ fontSize: 10, color: "var(--muted)", marginLeft: 16 }}>
                                {acc.type === "mortgage" ? "房屋貸款" : "個人貸款"}
                              </div>
                            </div>
                            <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13 }}>
                              <Amount value={acc.balanceMinor ?? 0n} currency={acc.currency} kind="expense" />
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}

                  {/* 剩餘未指定特定活存子項的信用卡 */}
                  {group.credits
                    .filter((c) => !c.id || !assignedAccountIds.has(c.id + "_rendered"))
                    .map((acc) => (
                      <div
                        key={acc.id}
                        style={{
                          marginLeft: 16,
                          padding: "8px 12px",
                          background: "rgba(239, 68, 68, 0.06)",
                          borderLeft: "3px solid var(--expense)",
                          borderRadius: "0 6px 6px 0",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--fg)", display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ color: "var(--muted)" }}>↳ 💳</span>
                            <span>{acc.name}</span>
                          </div>
                          <div style={{ fontSize: 10, color: "var(--muted)", marginLeft: 16 }}>未結清卡費</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13 }}>
                            <Amount value={acc.balanceMinor ?? 0n} currency={acc.currency} kind="expense" />
                          </div>
                          <button
                            type="button"
                            className="btn sm"
                            style={{ fontSize: 10, padding: "3px 7px", background: "rgba(79, 140, 255, 0.2)", color: "#60a5fa", border: "none", borderRadius: 4 }}
                            onClick={() => setPayModalCard(acc)}
                          >
                            🏦 結清卡費
                          </button>
                        </div>
                      </div>
                    ))}

                  {/* 剩餘未指定特定活存子項的貸款 */}
                  {group.loans
                    .filter((l) => !l.id || !assignedAccountIds.has(l.id + "_rendered"))
                    .map((acc) => (
                      <div
                        key={acc.id}
                        style={{
                          marginLeft: 16,
                          padding: "8px 12px",
                          background: "rgba(245, 158, 11, 0.06)",
                          borderLeft: "3px solid #f59e0b",
                          borderRadius: "0 6px 6px 0",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--fg)", display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ color: "var(--muted)" }}>↳ 🏠</span>
                            <span>{acc.name}</span>
                          </div>
                          <div style={{ fontSize: 10, color: "var(--muted)", marginLeft: 16 }}>
                            {acc.type === "mortgage" ? "房屋貸款" : "個人貸款"}
                          </div>
                        </div>
                        <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13 }}>
                          <Amount value={acc.balanceMinor ?? 0n} currency={acc.currency} kind="expense" />
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>

          {/* 右側獨立帳戶卡片（現金、電子錢包與新青安等獨立貸款） */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* 現金與電子錢包 */}
            <div className="ff3-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: "bold", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>💵</span> 現金與電子錢包 ({standaloneAssets.length})
                </h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {standaloneAssets.map((acc) => (
                  <div key={acc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{acc.name}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{acc.type.toUpperCase()} • {acc.currency}</div>
                    </div>
                    <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 14, color: "var(--fg)" }}>
                      <Amount value={acc.balanceMinor ?? 0n} currency={acc.currency} kind="neutral" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 獨立信用卡 (若有未配對到銀行者) */}
            {standaloneCredits.length > 0 && (
              <div className="ff3-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: "bold", display: "flex", alignItems: "center", gap: 6 }}>
                    <span>💳</span> 其他信用卡 ({standaloneCredits.length})
                  </h3>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {standaloneCredits.map((acc) => (
                    <div key={acc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{acc.name}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>未結清卡費</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13 }}>
                          <Amount value={acc.balanceMinor ?? 0n} currency={acc.currency} kind="expense" />
                        </div>
                        <button
                          type="button"
                          className="btn sm"
                          style={{ fontSize: 10, padding: "3px 7px", background: "rgba(79, 140, 255, 0.2)", color: "#60a5fa", border: "none", borderRadius: 4 }}
                          onClick={() => setPayModalCard(acc)}
                        >
                          🏦 結清卡費
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 獨立房貸與信貸（如新青安等） */}
            {standaloneLoans.length > 0 && (
              <div className="ff3-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: "bold", display: "flex", alignItems: "center", gap: 6 }}>
                    <span>🏠</span> 獨立房貸與貸款 ({standaloneLoans.length})
                  </h3>
                  <Link href="/schedule?tab=loan" style={{ fontSize: 12, color: "var(--accent)" }}>
                    貸款專區 ➔
                  </Link>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {standaloneLoans.map((acc) => (
                    <div key={acc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{acc.name}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>{acc.type === "mortgage" ? "房屋貸款" : "個人貸款"}</div>
                      </div>
                      <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 14 }}>
                        <Amount value={acc.balanceMinor ?? 0n} currency={acc.currency} kind="expense" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      <CreditCardPayModal
        isOpen={!!payModalCard}
        creditCardAccount={payModalCard}
        accounts={accounts}
        onClose={() => setPayModalCard(null)}
        onSuccess={() => {
          // Trigger page refresh / query invalidate if needed
        }}
      />
    </>
  );
}
