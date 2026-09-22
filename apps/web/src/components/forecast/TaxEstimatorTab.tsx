"use client";

import { useState, useEffect, useMemo } from "react";
import { AmountInput } from "@/components/AmountInput";
import { AccountOptions } from "@/components/AccountOptions";
import { niceConfirm } from "@/lib/confirm";
import type { ForecastAccount } from "./types";

interface TaxData {
  grossIncomeMinor: bigint;
  bonusIncomeMinor: bigint;
  stockGsuIncomeMinor: bigint;
  otherIncomeMinor: bigint;
  dependentsCount: number;
  marriedFilingJointly: boolean;
  youngChildrenCount: number;
  withheldTaxMinor: bigint;
  installmentCount: number;
  installmentStartMonth: number;
  accountId: string | null;
}

interface TaxEstimatorTabProps {
  targetYear: number;
  taxData: TaxData | undefined;
  accounts: ForecastAccount[];
  isSaving: boolean;
  isApplying: boolean;
  onSaveTax: (inputs: {
    year: number;
    grossIncome: string;
    bonusIncome: string;
    stockGsuIncome: string;
    otherIncome: string;
    dependentsCount: number;
    marriedFilingJointly: boolean;
    youngChildrenCount: number;
    withheldTax: string;
    installmentCount: number;
    installmentStartMonth: number;
    accountId: string | null;
  }) => Promise<void>;
  onApplyTax: (year: number, accountId?: string) => Promise<void>;
}

export function TaxEstimatorTab({
  targetYear,
  taxData,
  accounts,
  isSaving,
  isApplying,
  onSaveTax,
  onApplyTax,
}: TaxEstimatorTabProps) {
  const [taxGross, setTaxGross] = useState("2280000");
  const [taxBonus, setTaxBonus] = useState("342000");
  const [taxGsu, setTaxGsu] = useState("924000");
  const [taxOther, setTaxOther] = useState("0");
  const [taxDependents, setTaxDependents] = useState(4);
  const [taxMarried, setTaxMarried] = useState(true);
  const [taxChildren, setTaxChildren] = useState(1);
  const [taxWithheld, setTaxWithheld] = useState("315900");
  const [taxInstallmentCount, setTaxInstallmentCount] = useState(3);
  const [taxInstallmentStart, setTaxInstallmentStart] = useState(5);
  const [taxAccountId, setTaxAccountId] = useState("");
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  useEffect(() => {
    if (taxData) {
      setTaxGross(String(Number(taxData.grossIncomeMinor) / 100));
      setTaxBonus(String(Number(taxData.bonusIncomeMinor) / 100));
      setTaxGsu(String(Number(taxData.stockGsuIncomeMinor) / 100));
      setTaxOther(String(Number(taxData.otherIncomeMinor) / 100));
      setTaxDependents(taxData.dependentsCount);
      setTaxMarried(taxData.marriedFilingJointly);
      setTaxChildren(taxData.youngChildrenCount);
      setTaxWithheld(String(Number(taxData.withheldTaxMinor) / 100));
      setTaxInstallmentCount(taxData.installmentCount);
      setTaxInstallmentStart(taxData.installmentStartMonth);
      setTaxAccountId(taxData.accountId || "");
    }
  }, [taxData]);

  const liveTax = useMemo(() => {
    const gross = Number(taxGross) || 0;
    const bonus = Number(taxBonus) || 0;
    const gsu = Number(taxGsu) || 0;
    const other = Number(taxOther) || 0;
    const totalIncome = gross + bonus + gsu + other;

    const exemptions = Math.max(1, taxDependents) * 97_000;
    const standardDeduction = taxMarried ? 262_000 : 131_000;
    const salaryDeduction = Math.min(gross + bonus, 218_000);
    const childDeduction = Math.max(0, taxChildren) * 150_000;
    const totalDeductions = exemptions + standardDeduction + salaryDeduction + childDeduction;

    const netTaxableIncome = Math.max(0, totalIncome - totalDeductions);

    let calculatedTax = 0;
    let bracketName = "5%";
    if (netTaxableIncome <= 590_000) {
      calculatedTax = netTaxableIncome * 0.05;
      bracketName = "5%";
    } else if (netTaxableIncome <= 1_330_000) {
      calculatedTax = netTaxableIncome * 0.12 - 41_300;
      bracketName = "12% (累進差額 $41,300)";
    } else if (netTaxableIncome <= 2_660_000) {
      calculatedTax = netTaxableIncome * 0.20 - 147_700;
      bracketName = "20% (累進差額 $147,700)";
    } else if (netTaxableIncome <= 4_980_000) {
      calculatedTax = netTaxableIncome * 0.30 - 413_700;
      bracketName = "30% (累進差額 $413,700)";
    } else {
      calculatedTax = netTaxableIncome * 0.40 - 911_700;
      bracketName = "40% (累進差額 $911,700)";
    }
    calculatedTax = Math.round(calculatedTax);

    const withheld = Number(taxWithheld) || 0;
    const taxDue = Math.max(0, calculatedTax - withheld);

    const periods = Math.max(1, taxInstallmentCount);
    const installmentAmount = Math.round(taxDue / periods);
    const installmentMonths: number[] = [];
    for (let i = 0; i < periods; i++) {
      installmentMonths.push(((taxInstallmentStart - 1 + i) % 12) + 1);
    }

    return {
      totalIncome,
      exemptions,
      standardDeduction,
      salaryDeduction,
      childDeduction,
      totalDeductions,
      netTaxableIncome,
      bracketName,
      calculatedTax,
      withheld,
      taxDue,
      installmentAmount,
      installmentMonths,
    };
  }, [
    taxGross,
    taxBonus,
    taxGsu,
    taxOther,
    taxDependents,
    taxMarried,
    taxChildren,
    taxWithheld,
    taxInstallmentCount,
    taxInstallmentStart,
  ]);

  return (
    <div>
      {feedbackMsg && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 8,
            marginBottom: 16,
            background: feedbackMsg.includes("❌") ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
            color: feedbackMsg.includes("❌") ? "var(--expense)" : "var(--income)",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {feedbackMsg}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 20 }}>
        {/* Left Column: Tax Input Form */}
        <div className="ff3-card" style={{ padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
              📝 所得與扣除額設定 ({targetYear} 年度申報)
            </h3>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>台灣綜所稅模型</span>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await onSaveTax({
                  year: targetYear,
                  grossIncome: taxGross,
                  bonusIncome: taxBonus,
                  stockGsuIncome: taxGsu,
                  otherIncome: taxOther,
                  dependentsCount: taxDependents,
                  marriedFilingJointly: taxMarried,
                  youngChildrenCount: taxChildren,
                  withheldTax: taxWithheld,
                  installmentCount: taxInstallmentCount,
                  installmentStartMonth: taxInstallmentStart,
                  accountId: taxAccountId || null,
                });
                setFeedbackMsg("✅ 已成功儲存所得稅試算條件！");
                setTimeout(() => setFeedbackMsg(null), 4000);
              } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                setFeedbackMsg(`❌ 儲存失敗：${message}`);
              }
            }}
          >
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBottom: 8, borderBottom: "1px solid var(--border)", paddingBottom: 4 }}>
                💼 所得收入項目 (NT$)
              </div>
              <div className="grid cols-2" style={{ gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                    底薪年度總額 (月薪×12)
                  </label>
                  <AmountInput value={taxGross} onChange={setTaxGross} placeholder="例如：2280000" />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                    績效 / 年終獎金
                  </label>
                  <AmountInput value={taxBonus} onChange={setTaxBonus} placeholder="例如：342000" />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                    股票 / GSU / 員工認股
                  </label>
                  <AmountInput value={taxGsu} onChange={setTaxGsu} placeholder="例如：924000" />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                    其他各類所得
                  </label>
                  <AmountInput value={taxOther} onChange={setTaxOther} placeholder="0" />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBottom: 8, borderBottom: "1px solid var(--border)", paddingBottom: 4 }}>
                👨‍👩‍👧 扶養親屬與特別扣除
              </div>
              <div className="grid cols-2" style={{ gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                    受扶養親屬人數 (含本人/配偶/長輩)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={taxDependents}
                    onChange={(e) => setTaxDependents(Number(e.target.value))}
                  />
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                    每人免稅額 $97,000 (目前共 ${taxDependents * 97_000})
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                    幼兒學前扣除額 (未滿 6 歲人數)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    value={taxChildren}
                    onChange={(e) => setTaxChildren(Number(e.target.value))}
                  />
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                    每名幼兒 $150,000 (目前共 ${taxChildren * 150_000})
                  </div>
                </div>
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={taxMarried}
                  onChange={(e) => setTaxMarried(e.target.checked)}
                />
                <span>夫妻合併申報 (標準扣除額 $262,000；單身為 $131,000)</span>
              </label>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBottom: 8, borderBottom: "1px solid var(--border)", paddingBottom: 4 }}>
                💳 已扣繳稅額與分期繳納設定
              </div>
              <div className="grid cols-2" style={{ gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                    已預扣稅額 (公司預扣) *
                  </label>
                  <AmountInput value={taxWithheld} onChange={setTaxWithheld} placeholder="例如：315900" />
                </div>

                <div>
                  <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                    所得稅分期期數
                  </label>
                  <select
                    value={taxInstallmentCount}
                    onChange={(e) => setTaxInstallmentCount(Number(e.target.value))}
                  >
                    <option value={1}>單次繳納 (不分期)</option>
                    <option value={2}>2 期分期</option>
                    <option value={3}>3 期分期 (推薦：5、6、7 月)</option>
                    <option value={6}>6 期分期</option>
                  </select>
                </div>
              </div>

              <div className="grid cols-2" style={{ gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                    分期起始月份
                  </label>
                  <select
                    value={taxInstallmentStart}
                    onChange={(e) => setTaxInstallmentStart(Number(e.target.value))}
                  >
                    {[5, 6, 7].map((m) => (
                      <option key={m} value={m}>
                        {m} 月開始扣款
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                    指定扣款銀行帳戶
                  </label>
                  <select value={taxAccountId} onChange={(e) => setTaxAccountId(e.target.value)}>
                    <option value="">(由現金流總覽統一扣減)</option>
                    <AccountOptions accounts={accounts} />
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <button
                type="submit"
                className="btn"
                disabled={isSaving}
                style={{ fontSize: 13, padding: "8px 16px" }}
              >
                {isSaving ? "儲存中…" : "💾 儲存試算設定"}
              </button>

              <button
                type="button"
                className="btn"
                style={{
                  background: "linear-gradient(135deg, #4f46e5, #06b6d4)",
                  color: "#fff",
                  fontSize: 13,
                  padding: "8px 16px",
                }}
                disabled={isApplying}
                onClick={async () => {
                  const ok = await niceConfirm(
                    "套用所得稅分期",
                    `確定要將應補繳稅額 NT$ ${liveTax.taxDue.toLocaleString()} 分 ${liveTax.installmentMonths.length} 期（${liveTax.installmentMonths.join("、")}月各約 NT$ ${liveTax.installmentAmount.toLocaleString()}）自動加入年度預算並反映至各帳戶現金流預估嗎？`
                  );
                  if (ok) {
                    try {
                      await onApplyTax(targetYear, taxAccountId || undefined);
                      setFeedbackMsg("🎉 已將 3 期所得稅分期扣款匯入年度預算！現金流與 12 個月矩陣已即時更新。");
                      setTimeout(() => setFeedbackMsg(null), 5000);
                    } catch (err: unknown) {
                      const message = err instanceof Error ? err.message : String(err);
                      setFeedbackMsg(`❌ 套用失敗：${message}`);
                    }
                  }
                }}
              >
                {isApplying ? "套用中…" : "🚀 一鍵套用至現金流預估"}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Interactive Visual Tax Breakdown */}
        <div className="ff3-card" style={{ padding: 22, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
                📊 綜所稅試算明細與分期結果
              </h3>
              <span style={{ fontSize: 12, background: "rgba(99, 102, 241, 0.2)", color: "#a5b4fc", padding: "2px 8px", borderRadius: 4 }}>
                即時連動試算
              </span>
            </div>

            {/* Summary Breakdown Table */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ color: "var(--muted)" }}>年度總所得 (底薪+獎金+GSU)</span>
                <span style={{ fontWeight: 600, fontFamily: "monospace" }}>
                  NT$ {liveTax.totalIncome.toLocaleString()}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ color: "var(--muted)" }}>(-) 總免稅額與扣除額抵免</span>
                <span style={{ fontWeight: 600, fontFamily: "monospace", color: "var(--income)" }}>
                  - NT$ {liveTax.totalDeductions.toLocaleString()}
                </span>
              </div>

              {/* Deductions sub-list */}
              <div style={{ padding: "6px 12px", background: "rgba(0,0,0,0.2)", borderRadius: 6, fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>• 扶養免稅額 ({taxDependents}人 × $97k)</span>
                  <span style={{ fontFamily: "monospace" }}>${liveTax.exemptions.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>• 標準扣除額 ({taxMarried ? "夫妻合併" : "單身"})</span>
                  <span style={{ fontFamily: "monospace" }}>${liveTax.standardDeduction.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>• 薪資特別扣除額 (上限 $218k)</span>
                  <span style={{ fontFamily: "monospace" }}>${liveTax.salaryDeduction.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>• 幼兒學前扣除額 ({taxChildren}幼兒 × $150k)</span>
                  <span style={{ fontFamily: "monospace" }}>${liveTax.childDeduction.toLocaleString()}</span>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ fontWeight: 600 }}>(=) 綜合所得淨額</span>
                <span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 14 }}>
                  NT$ {liveTax.netTaxableIncome.toLocaleString()}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 12, color: "var(--muted)" }}>
                <span>適用累進稅率級距</span>
                <span style={{ fontFamily: "monospace" }}>{liveTax.bracketName}</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ color: "var(--muted)" }}>應納稅額 (計算結果)</span>
                <span style={{ fontWeight: 600, fontFamily: "monospace" }}>
                  NT$ {liveTax.calculatedTax.toLocaleString()}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ color: "var(--muted)" }}>(-) 已扣繳稅額 (預扣)</span>
                <span style={{ fontWeight: 600, fontFamily: "monospace", color: "#60a5fa" }}>
                  - NT$ {liveTax.withheld.toLocaleString()}
                </span>
              </div>

              {/* Tax Due Highlight Card */}
              <div
                style={{
                  padding: "14px 16px",
                  background: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid rgba(239, 68, 68, 0.25)",
                  borderRadius: 8,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 4,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>應補繳總稅額</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "var(--expense)", fontFamily: "monospace" }}>
                    NT$ {liveTax.taxDue.toLocaleString()}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: 11, background: "rgba(239, 68, 68, 0.2)", color: "#fca5a5", padding: "2px 8px", borderRadius: 4 }}>
                    {taxInstallmentCount} 期信用卡或銀行繳納
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Installments Schedule Preview */}
          <div style={{ marginTop: 18, padding: 14, background: "rgba(99, 102, 241, 0.08)", border: "1px solid rgba(99, 102, 241, 0.2)", borderRadius: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#a5b4fc", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <span>🗓️ 所得稅 {taxInstallmentCount} 期扣款排程預覽</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${liveTax.installmentMonths.length}, 1fr)`, gap: 10 }}>
              {liveTax.installmentMonths.map((m, idx) => (
                <div
                  key={m}
                  style={{
                    background: "rgba(0,0,0,0.3)",
                    padding: "10px",
                    borderRadius: 6,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>第 {idx + 1} 期 ({m}月)</div>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "monospace", color: "#facc15", marginTop: 4 }}>
                    NT$ {liveTax.installmentAmount.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
              💡 點擊「一鍵套用至現金流預估」後，系統會在 <strong>{liveTax.installmentMonths.join("月、")}月</strong> 各建立固定預算扣除，在 Tab 1 及 Tab 3 中精確呈現！
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
