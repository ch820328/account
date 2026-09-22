"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { fmt } from "@/lib/format";
import { niceToast } from "@/lib/confirm";

export function LoanTaxReportModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    // If before June, default to previous tax reporting year, else current year
    const month = new Date().getMonth();
    return month < 5 ? currentYear - 1 : currentYear;
  });

  const taxQuery = trpc.loanPayments.taxReport.useQuery({ year: selectedYear });
  const data = taxQuery.data;

  const handleCopyReport = async () => {
    if (!data) return;
    const text = [
      `【${data.year} 年度自用住宅購屋借款利息所得稅列舉扣除額申報資料】`,
      `• 納稅年度：${data.year} 年`,
      `• 房貸利息支出總額：${fmt(BigInt(data.totalInterestMinor), "TWD")}`,
      `• 法定扣除額上限：${fmt(BigInt(data.statutoryCapMinor), "TWD")}`,
      `• 本年度可申報列舉扣除額：${fmt(BigInt(data.eligibleDeductionMinor), "TWD")}`,
      `• 法定額度使用率：${data.capUsagePercent}%`,
      `• 房貸筆數：${data.byLoan.map((l) => `${l.loanName} (${fmt(BigInt(l.amountMinor), l.currency)})`).join(", ") || "無"}`,
      `（依所得稅法第 17 條規定，購屋借款利息每一申報戶每年以 30 萬元為限，並應扣除儲蓄投資特別扣除額）`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      await niceToast("📋 已複製申報數據至剪貼簿！", "success");
    } catch {
      await niceToast("複製失敗，請手動選取複製", "warning");
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card"
        style={{
          width: "clamp(600px, 50vw, 1100px)",
          maxWidth: "95vw",
          maxHeight: "92vh",
          overflowY: "auto",
          backgroundColor: "var(--surface-1)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
          padding: "24px",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: "bold" }}>
              🧾 房貸利息所得稅列舉扣除額報表（每年 5 月申報專用）
            </h3>
            <p className="muted" style={{ margin: 0, fontSize: "13px" }}>
              所得稅法第 17 條：納稅義務人自用住宅購屋借款利息，每戶每年最高可列舉扣除 30 萬元。
            </p>
          </div>
          <button
            type="button"
            className="btn ghost sm"
            style={{ fontSize: "18px", padding: "4px 8px", lineHeight: 1 }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Year Filter & Copy Bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            marginBottom: "20px",
            backgroundColor: "var(--surface-2)",
            padding: "12px 16px",
            borderRadius: "8px",
            border: "1px solid var(--border)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "14px", fontWeight: "bold" }}>申報年度：</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              style={{ fontSize: "14px", padding: "4px 12px" }}
            >
              {[currentYear + 1, currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map((y) => (
                <option key={y} value={y}>
                  {y} 年 (民國 {y - 1911} 年度)
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="btn ghost sm"
            onClick={handleCopyReport}
            disabled={!data || data.transactions.length === 0}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            📋 一鍵複製申報數據
          </button>
        </div>

        {taxQuery.isPending && (
          <div style={{ textAlign: "center", padding: "32px", color: "var(--muted)" }}>
            正在匯總 {selectedYear} 年度房貸利息扣繳支出…
          </div>
        )}

        {data && (
          <>
            {/* Top Stat Cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                gap: "12px",
                marginBottom: "16px",
              }}
            >
              <div className="card" style={{ padding: "14px", backgroundColor: "var(--surface-2)" }}>
                <div className="muted" style={{ fontSize: "12px" }}>當年度房貸利息總支出</div>
                <div style={{ fontSize: "18px", fontWeight: "bold", color: "var(--expense)", marginTop: 4 }}>
                  {fmt(BigInt(data.totalInterestMinor), "TWD")}
                </div>
              </div>

              <div className="card" style={{ padding: "14px", backgroundColor: "var(--surface-2)" }}>
                <div className="muted" style={{ fontSize: "12px" }}>法定列舉扣除上限</div>
                <div style={{ fontSize: "18px", fontWeight: "bold", color: "var(--text)", marginTop: 4 }}>
                  {fmt(BigInt(data.statutoryCapMinor), "TWD")}
                </div>
              </div>

              <div className="card" style={{ padding: "14px", backgroundColor: "var(--surface-2)" }}>
                <div className="muted" style={{ fontSize: "12px" }}>本年度可申報扣除額</div>
                <div style={{ fontSize: "18px", fontWeight: "bold", color: "var(--income)", marginTop: 4 }}>
                  {fmt(BigInt(data.eligibleDeductionMinor), "TWD")}
                </div>
              </div>

              <div className="card" style={{ padding: "14px", backgroundColor: "var(--surface-2)" }}>
                <div className="muted" style={{ fontSize: "12px" }}>30 萬額度使用進度</div>
                <div style={{ fontSize: "18px", fontWeight: "bold", color: data.isCapped ? "#ef4444" : "var(--primary)", marginTop: 4 }}>
                  {data.capUsagePercent}% {data.isCapped && <span style={{ fontSize: "12px" }}>(已達上限)</span>}
                </div>
              </div>
            </div>

            {/* Progress Track */}
            <div style={{ marginBottom: "24px" }}>
              <div className="bar-track" style={{ height: "8px", backgroundColor: "var(--surface-3)", borderRadius: "4px" }}>
                <div
                  className="bar-fill"
                  style={{
                    width: `${data.capUsagePercent}%`,
                    backgroundColor: data.isCapped ? "#ef4444" : "var(--income)",
                    height: "100%",
                    borderRadius: "4px",
                    transition: "width 0.3s",
                  }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--muted)", marginTop: 4 }}>
                <span>NT$ 0</span>
                <span>剩餘可用扣除額度：{fmt(BigInt(data.remainingCapMinor), "TWD")}</span>
                <span>上限 NT$ 300,000</span>
              </div>
            </div>

            {/* Loan Contribution Table */}
            {data.byLoan.length > 0 ? (
              <div style={{ marginBottom: "24px" }}>
                <h4 style={{ margin: "0 0 8px", fontSize: "14px", fontWeight: "bold" }}>
                  🏦 各房貸計畫利息支出明細
                </h4>
                <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                      <th style={{ padding: "6px 8px" }}>房貸名稱</th>
                      <th style={{ padding: "6px 8px", textAlign: "center" }}>繳息筆數</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>利息總額</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>佔比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byLoan.map((l, i) => {
                      const pct = Number(data.totalInterestMinor) > 0
                        ? Math.round((Number(l.amountMinor) * 100) / Number(data.totalInterestMinor))
                        : 0;
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <td style={{ padding: "8px" }}>{l.loanName}</td>
                          <td style={{ padding: "8px", textAlign: "center" }}>{l.count} 筆</td>
                          <td style={{ padding: "8px", textAlign: "right", fontWeight: "bold", color: "var(--expense)" }}>
                            {fmt(BigInt(l.amountMinor), l.currency)}
                          </td>
                          <td style={{ padding: "8px", textAlign: "right" }}>{pct}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="muted" style={{ textAlign: "center", padding: "20px 0" }}>
                {selectedYear} 年度尚無房貸利息支出交易紀錄。
              </div>
            )}

            {/* 12 Months Breakdown */}
            {data.byMonth.some((m) => Number(m.amountMinor) > 0) && (
              <div style={{ marginBottom: "20px" }}>
                <h4 style={{ margin: "0 0 8px", fontSize: "14px", fontWeight: "bold" }}>
                  📅 1 ~ 12 月每月利息支出分佈
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "8px" }}>
                  {data.byMonth.map((m) => (
                    <div
                      key={m.month}
                      className="card"
                      style={{
                        padding: "8px",
                        textAlign: "center",
                        backgroundColor: Number(m.amountMinor) > 0 ? "var(--surface-2)" : "transparent",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div className="muted" style={{ fontSize: "11px" }}>{m.month} 月</div>
                      <div style={{ fontSize: "12px", fontWeight: "bold", marginTop: 2, color: Number(m.amountMinor) > 0 ? "var(--expense)" : "var(--muted)" }}>
                        {Number(m.amountMinor) > 0 ? fmt(BigInt(m.amountMinor), "TWD") : "-"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Legal Notice Footer */}
            <div
              className="muted"
              style={{
                fontSize: "11px",
                lineHeight: 1.5,
                backgroundColor: "var(--surface-2)",
                padding: "10px 12px",
                borderRadius: "6px",
                borderLeft: "3px solid var(--primary)",
              }}
            >
              💡 <strong>所得稅申報小叮嚀</strong>：
              申報購屋借款利息列舉扣除時，房屋登記所有權人需為納稅義務人、配偶或受扶養親屬，且辦竣戶籍登記無出租供營業使用者為限。此外，依稅法規定，列舉扣除金額須先扣除「儲蓄投資特別扣除額（金融機構存款利息所得）」。
            </div>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
          <button type="button" className="btn ghost" onClick={onClose}>
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
