"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { fmt } from "@/lib/format";
import { niceConfirm, niceToast } from "@/lib/confirm";
import { AmountInput } from "@/components/AmountInput";

export function LoanPrepaymentModal({
  scheduleId,
  scheduleName,
  currency,
  currentOwedMinor,
  sourceAccountId,
  assetAccounts,
  onClose,
  onSuccess,
}: {
  scheduleId: string;
  scheduleName: string;
  currency: string;
  currentOwedMinor: bigint;
  sourceAccountId: string;
  assetAccounts: { id: string; name: string; currency: string }[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [prepayAmount, setPrepayAmount] = useState("500000");
  const [selectedSourceId, setSelectedSourceId] = useState(sourceAccountId || (assetAccounts[0]?.id ?? ""));
  const [mode, setMode] = useState<"reduce_payment" | "reduce_term">("reduce_term");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);

  // Debounced/controlled query for simulation
  const validAmount = useMemo(() => {
    const num = Number(prepayAmount.replace(/,/g, ""));
    return !isNaN(num) && num > 0 ? String(num) : "0";
  }, [prepayAmount]);

  const simQuery = trpc.loanPayments.simulatePrepayment.useQuery(
    { scheduleId, amount: validAmount },
    { enabled: Number(validAmount) > 0, retry: false }
  );

  const executeMutation = trpc.loanPayments.executePrepayment.useMutation();

  const handleQuickAdd = (addAmount: number) => {
    const cur = Number(prepayAmount.replace(/,/g, "")) || 0;
    setPrepayAmount(String(cur + addAmount));
  };

  const handlePayoffAll = () => {
    const owedMajor = Math.round(Number(currentOwedMinor) / 100);
    setPrepayAmount(String(owedMajor));
  };

  const sim = simQuery.data;

  async function handleExecute() {
    if (!selectedSourceId) {
      await niceToast("請選擇扣款銀行帳戶", "warning");
      return;
    }
    const num = Number(prepayAmount.replace(/,/g, ""));
    if (isNaN(num) || num <= 0) {
      await niceToast("請輸入正確的還本金額", "warning");
      return;
    }

    const modeText = mode === "reduce_term" ? "月繳不變，縮短總期數" : "期數不變，降低每月月繳";
    const ok = await niceConfirm(
      "確認執行大額提前還本",
      `即將自指定銀行扣除 NT$ ${num.toLocaleString()} 沖銷「${scheduleName}」本金。\n選擇方案：【${modeText}】。\n此操作將產生銀行轉帳支出並立即更新房貸剩餘本金，確定執行嗎？`,
      "warning"
    );

    if (!ok) return;

    setIsExecuting(true);
    try {
      await executeMutation.mutateAsync({
        scheduleId,
        sourceAccountId: selectedSourceId,
        amount: String(num),
        mode,
        date,
        note: note || `[大額提前還本] ${scheduleName} (${modeText})`,
      });
      await niceToast("🎉 提前還本沖銷成功！已更新負債本金與排程", "success");
      onSuccess();
      onClose();
    } catch (err: any) {
      await niceToast(err?.message || "提前還本執行失敗", "error");
    } finally {
      setIsExecuting(false);
    }
  }

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
          width: "clamp(580px, 50vw, 1050px)",
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
              💰 {scheduleName} — 大額提前還本試算與沖銷
            </h3>
            <p className="muted" style={{ margin: 0, fontSize: "13px" }}>
              台灣標準銀行購屋貸款提前還本模型：對比「減額」與「縮期」之節省利息與現金流影響。
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

        {/* Current status banner */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "12px",
            backgroundColor: "var(--surface-2)",
            padding: "14px 16px",
            borderRadius: "8px",
            marginBottom: "20px",
            border: "1px solid var(--border)",
          }}
        >
          <div>
            <div className="muted" style={{ fontSize: "12px" }}>當前未清償本金</div>
            <div style={{ fontSize: "16px", fontWeight: "bold", color: "var(--expense)" }}>
              {fmt(currentOwedMinor, currency)}
            </div>
          </div>
          {sim && (
            <>
              <div>
                <div className="muted" style={{ fontSize: "12px" }}>目前適用實質年利率</div>
                <div style={{ fontSize: "16px", fontWeight: "bold", color: "var(--text)" }}>
                  {sim.annualRatePct.toFixed(3)} %
                </div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: "12px" }}>剩餘總期數 / 目前月繳</div>
                <div style={{ fontSize: "16px", fontWeight: "bold", color: "var(--text)" }}>
                  {sim.originalRemainingPeriods} 期 ({fmt(BigInt(sim.originalPaymentMinor), currency)}/月)
                </div>
              </div>
            </>
          )}
        </div>

        {/* Input Prepayment Amount */}
        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "6px" }}>
            欲提前還本金額 (TWD)
          </label>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <AmountInput
              required
              value={prepayAmount}
              onChange={setPrepayAmount}
              placeholder="例如 500,000"
              style={{ fontSize: "16px", fontWeight: "bold", flex: 1 }}
            />
            <button type="button" className="btn ghost sm" onClick={() => handleQuickAdd(100000)}>
              +10萬
            </button>
            <button type="button" className="btn ghost sm" onClick={() => handleQuickAdd(500000)}>
              +50萬
            </button>
            <button type="button" className="btn ghost sm" onClick={() => handleQuickAdd(1000000)}>
              +100萬
            </button>
            <button type="button" className="btn ghost sm" onClick={handlePayoffAll} style={{ color: "var(--income)" }}>
              全部結清
            </button>
          </div>
        </div>

        {/* Comparison Cards (Option A vs Option B) */}
        {simQuery.isPending && (
          <div style={{ textAlign: "center", padding: "24px", color: "var(--muted)" }}>
            正在依台灣年金公式即時動態精確模擬中…
          </div>
        )}

        {sim && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
            {/* Option A: Reduce Payment */}
            <div
              className="card"
              style={{
                padding: "16px",
                border: mode === "reduce_payment" ? "2px solid var(--primary)" : "1px solid var(--border)",
                backgroundColor: mode === "reduce_payment" ? "rgba(59, 130, 246, 0.08)" : "var(--surface-2)",
                cursor: "pointer",
                borderRadius: "8px",
                transition: "all 0.2s",
              }}
              onClick={() => setMode("reduce_payment")}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontWeight: "bold", fontSize: "15px", color: "var(--primary)" }}>
                  方案 A：期數不變，月繳下降
                </span>
                <input
                  type="radio"
                  name="prepay_mode"
                  checked={mode === "reduce_payment"}
                  onChange={() => setMode("reduce_payment")}
                />
              </div>
              <p className="muted" style={{ fontSize: "12px", margin: "0 0 12px", lineHeight: 1.4 }}>
                維持剩餘 {sim.originalRemainingPeriods} 期年限，立即減輕每個月的現金流負擔。
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="muted">還本後新月繳：</span>
                  <strong>{fmt(BigInt(sim.optionA.newPaymentMinor), currency)} /月</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="muted">每月少繳現金流：</span>
                  <strong style={{ color: "var(--income)" }}>
                    - {fmt(BigInt(sim.optionA.monthlySavingsMinor), currency)}
                  </strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px dashed var(--border)", paddingTop: 6, marginTop: 4 }}>
                  <span className="muted">總共節省利息：</span>
                  <strong style={{ color: "var(--income)", fontSize: "14px" }}>
                    {fmt(BigInt(sim.optionA.totalInterestSavedMinor), currency)}
                  </strong>
                </div>
              </div>
            </div>

            {/* Option B: Reduce Term */}
            <div
              className="card"
              style={{
                padding: "16px",
                border: mode === "reduce_term" ? "2px solid #10b981" : "1px solid var(--border)",
                backgroundColor: mode === "reduce_term" ? "rgba(16, 185, 129, 0.08)" : "var(--surface-2)",
                cursor: "pointer",
                borderRadius: "8px",
                transition: "all 0.2s",
              }}
              onClick={() => setMode("reduce_term")}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontWeight: "bold", fontSize: "15px", color: "#10b981" }}>
                  方案 B：月繳不變，總期數縮短 ★
                </span>
                <input
                  type="radio"
                  name="prepay_mode"
                  checked={mode === "reduce_term"}
                  onChange={() => setMode("reduce_term")}
                />
              </div>
              <p className="muted" style={{ fontSize: "12px", margin: "0 0 12px", lineHeight: 1.4 }}>
                維持每月 {fmt(BigInt(sim.originalPaymentMinor), currency)} 月付金，提早還清並省下大量利息。
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="muted">縮短後剩餘期數：</span>
                  <strong>{sim.optionB.newRemainingPeriods} 期</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="muted">提早還清時間：</span>
                  <strong style={{ color: "#10b981" }}>
                    提早 {sim.optionB.yearsMonthsShortened.years > 0 ? `${sim.optionB.yearsMonthsShortened.years} 年 ` : ""}{sim.optionB.yearsMonthsShortened.months} 個月 (縮短 {sim.optionB.periodsShortened} 期)
                  </strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px dashed var(--border)", paddingTop: 6, marginTop: 4 }}>
                  <span className="muted">總共節省利息：</span>
                  <strong style={{ color: "#10b981", fontSize: "14px" }}>
                    {fmt(BigInt(sim.optionB.totalInterestSavedMinor), currency)}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Execution Form */}
        <div
          style={{
            backgroundColor: "var(--surface-2)",
            padding: "16px",
            borderRadius: "8px",
            border: "1px solid var(--border)",
          }}
        >
          <h4 style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: "bold" }}>
            ⚡ 確認並執行大額還款沖銷
          </h4>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <label>
              <span className="field-label">扣款銀行帳戶</span>
              <select
                value={selectedSourceId}
                onChange={(e) => setSelectedSourceId(e.target.value)}
                style={{ width: "100%" }}
              >
                {assetAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="field-label">沖銷轉帳日期</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{ width: "100%" }}
              />
            </label>
          </div>

          <label style={{ display: "block", marginBottom: "14px" }}>
            <span className="field-label">自訂備註 (選填)</span>
            <input
              placeholder={`[大額提前還本] ${scheduleName}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ width: "100%" }}
            />
          </label>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", alignItems: "center" }}>
            <button type="button" className="btn ghost" onClick={onClose} disabled={isExecuting}>
              取消
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={handleExecute}
              disabled={isExecuting || !sim || Number(validAmount) <= 0}
            >
              {isExecuting ? "處理中…" : `確認沖銷本金 NT$ ${Number(validAmount).toLocaleString()}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
