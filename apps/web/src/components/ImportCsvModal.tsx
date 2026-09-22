"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AccountOptions } from "@/components/AccountOptions";

interface ImportCsvModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  accounts: {
    id: string;
    name: string;
    type?: string;
    currency: string;
    cardNumber?: string | null;
  }[];
}

interface ParsedRow {
  occurredAt: string; // YYYY-MM-DD
  note: string;
  amountMinor: string;
  type: "expense" | "income";
  isPayment?: boolean;
}

export function ImportCsvModal({ isOpen, onClose, onSuccess, accounts }: ImportCsvModalProps) {
  // Pre-select CTBC credit card or first credit card
  const ctbcCard = accounts.find((a) => a.type === "credit" && a.name.includes("中國信託"));
  const defaultAccId = ctbcCard?.id || accounts.find((a) => a.type === "credit")?.id || accounts[0]?.id || "";

  const [accountId, setAccountId] = useState(defaultAccId);
  const [fileName, setFileName] = useState<string>("");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [skipPayments, setSkipPayments] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<{ imported: number; skipped: number } | null>(null);

  const importMutation = trpc.transactions.importCsv.useMutation({
    onSuccess: (res) => {
      setResultMsg({ imported: res.importedCount, skipped: res.skippedCount });
      onSuccess();
    },
    onError: (err) => {
      setErrorMsg(`匯入失敗：${err.message}`);
    },
  });

  if (!isOpen) return null;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setErrorMsg(null);
    setResultMsg(null);

    try {
      // 1. Read file with Big5 fallback detection
      const text = await readFileWithEncoding(file);
      const rows = parseCreditCardCsv(text);
      if (rows.length === 0) {
        setErrorMsg("未能自 CSV 檔案解析出有效交易紀錄，請確認檔案格式是否正確。");
        setParsedRows([]);
        return;
      }
      setParsedRows(rows);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`解析 CSV 失敗：${msg}`);
      setParsedRows([]);
    }
  }

  function readFileWithEncoding(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      // Try UTF-8 first
      reader.readAsText(file, "UTF-8");
      reader.onload = () => {
        const result = reader.result as string;
        // Check for Big5 mojibake or replacement characters
        if (result.includes("\uFFFD") || !result.includes("消費日")) {
          // Re-read as Big5 (standard for CTBC Taiwan)
          const big5Reader = new FileReader();
          big5Reader.readAsText(file, "Big5");
          big5Reader.onload = () => resolve(big5Reader.result as string);
          big5Reader.onerror = () => reject(new Error("無法以 Big5 編碼讀取檔案"));
        } else {
          resolve(result);
        }
      };
      reader.onerror = () => reject(new Error("讀取檔案失敗"));
    });
  }

  function parseCreditCardCsv(content: string): ParsedRow[] {
    const lines = content.split(/\r?\n/);
    const parsed: ParsedRow[] = [];

    // Find header line index
    let headerIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!.trim();
      if (l.includes("消費日") || (l.toLowerCase().includes("date") && l.toLowerCase().includes("amount"))) {
        headerIdx = i;
        break;
      }
    }

    if (headerIdx === -1) {
      return [];
    }

    const headerLine = lines[headerIdx]!;
    const headerCols = parseCsvLine(headerLine).map((c) => c.trim());
    const isCtbc = headerCols.some((c) => c.includes("消費日")) && headerCols.some((c) => c.includes("金額"));

    // Find dynamic column indices
    let dateIdx = -1;
    let noteIdx = -1;
    let amountIdx = -1;
    let cardIdx = -1;

    if (isCtbc) {
      for (let i = 0; i < headerCols.length; i++) {
        const col = headerCols[i]!;
        if (col.includes("消費日")) dateIdx = i;
        else if (col.includes("摘要")) noteIdx = i;
        else if (col.includes("新臺幣金額") || (col.includes("金額") && amountIdx === -1)) amountIdx = i;
        else if (col.includes("末四碼")) cardIdx = i;
      }
    }

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (!line) continue;

      if (isCtbc && dateIdx !== -1 && amountIdx !== -1) {
        const cols = parseCsvLine(line);
        if (cols.length <= Math.max(dateIdx, amountIdx)) continue;

        const rawDate = cols[dateIdx]?.trim();
        const rawNote = (noteIdx !== -1 ? cols[noteIdx]?.trim() : "") || "";
        const rawAmount = cols[amountIdx]?.trim().replace(/[",\s]/g, "");
        const cardLast4 = cardIdx !== -1 ? cols[cardIdx]?.trim() : "";

        if (!rawDate || !rawAmount) continue;

        // Convert YYYY/MM/DD to YYYY-MM-DD
        const dateParts = rawDate.split("/");
        if (dateParts.length !== 3 || !dateParts[0] || !dateParts[1] || !dateParts[2]) continue;
        const occurredAt = `${dateParts[0]}-${dateParts[1].padStart(2, "0")}-${dateParts[2].padStart(2, "0")}`;

        const numAmount = parseFloat(rawAmount);
        if (isNaN(numAmount)) continue;

        const isPayment = numAmount < 0 || rawNote.includes("繳") || rawNote.includes("繳款");
        const absAmount = Math.abs(numAmount);
        const amountMinor = BigInt(Math.round(absAmount * 100)).toString();

        // Note decoration: add last4 if multiple cards present
        const noteWithCard = cardLast4 ? `${rawNote} (${cardLast4})`.trim() : rawNote;

        parsed.push({
          occurredAt,
          note: noteWithCard,
          amountMinor,
          type: isPayment ? "income" : "expense",
          isPayment,
        });
      } else {
        // Generic CSV fallback: Date, Amount, Note
        const cols = parseCsvLine(line);
        if (cols.length >= 2) {
          const rawDate = cols[0]?.trim();
          const rawAmount = cols[1]?.trim().replace(/[",\s]/g, "");
          const rawNote = cols[2]?.trim() || "";

          if (!rawDate || !rawAmount) continue;
          const numAmount = parseFloat(rawAmount);
          if (isNaN(numAmount)) continue;

          parsed.push({
            occurredAt: rawDate.replace(/\//g, "-"),
            note: rawNote,
            amountMinor: BigInt(Math.round(Math.abs(numAmount) * 100)).toString(),
            type: numAmount < 0 ? "income" : "expense",
          });
        }
      }
    }

    return parsed;
  }

  function parseCsvLine(text: string): string[] {
    const result: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === "," && !inQuotes) {
        result.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
    result.push(cur);
    return result;
  }

  const effectiveRows = skipPayments ? parsedRows.filter((r) => !r.isPayment) : parsedRows;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="ff3-card"
        style={{
          width: "clamp(580px, 50vw, 1050px)",
          maxWidth: "95vw",
          background: "var(--bg)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 12,
          padding: 24,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            📥 匯入信用卡 / 銀行交易 CSV
          </h3>
          <button type="button" className="btn ghost" onClick={onClose} style={{ fontSize: 18 }}>
            ✕
          </button>
        </div>

        {resultMsg ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
            <h4 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>匯入完成！</h4>
            <p style={{ color: "var(--fg)", fontSize: 14, margin: "0 0 16px" }}>
              成功寫入 <strong>{resultMsg.imported}</strong> 筆新交易紀錄。
              {resultMsg.skipped > 0 && (
                <span style={{ color: "var(--muted)", display: "block", marginTop: 4 }}>
                  🛡️ 系統自動為您過濾掉 <strong>{resultMsg.skipped}</strong> 筆已存在的重複項目！
                </span>
              )}
            </p>
            <button type="button" className="btn" onClick={onClose}>
              完成並返回交易清單
            </button>
          </div>
        ) : (
          <div>
            {/* Account selection */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                指定入帳帳戶 *
              </label>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <AccountOptions accounts={accounts} />
              </select>
            </div>

            {/* File Upload Box */}
            <div
              style={{
                border: "2px dashed rgba(255,255,255,0.18)",
                borderRadius: 8,
                padding: "24px 16px",
                textAlign: "center",
                marginBottom: 16,
                background: "rgba(0,0,0,0.15)",
                cursor: "pointer",
              }}
              onClick={() => document.getElementById("csvFileInput")?.click()}
            >
              <input
                id="csvFileInput"
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
              <div style={{ fontSize: 32, marginBottom: 6 }}>📄</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {fileName ? `已選擇：${fileName}` : "點擊選擇或拖曳 CSV 檔案至此"}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                支援中國信託（CTBC）網銀匯出之 CSV（自動處理 Big5 編碼）與一般標準 CSV
              </div>
            </div>

            {/* Skip payments option */}
            {parsedRows.some((r) => r.isPayment) && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 14, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={skipPayments}
                  onChange={(e) => setSkipPayments(e.target.checked)}
                />
                <span>自動略過信用卡繳款項目（如：網銀行動繳 -146,265 元，避免重複計入）</span>
              </label>
            )}

            {/* Preview table */}
            {effectiveRows.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                  <span>解析預覽（共 {effectiveRows.length} 筆待檢查）</span>
                  <span>🛡️ 匯入時若資料庫已有相同紀錄將自動跳過</span>
                </div>

                <div
                  style={{
                    maxHeight: 180,
                    overflowY: "auto",
                    background: "rgba(0,0,0,0.25)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 12,
                  }}
                >
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", textAlign: "left", color: "var(--muted)" }}>
                        <th style={{ padding: "4px" }}>日期</th>
                        <th style={{ padding: "4px" }}>摘要</th>
                        <th style={{ padding: "4px", textAlign: "right" }}>金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {effectiveRows.slice(0, 15).map((r, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          <td style={{ padding: "4px", fontFamily: "monospace" }}>{r.occurredAt}</td>
                          <td style={{ padding: "4px" }}>{r.note}</td>
                          <td style={{ padding: "4px", textAlign: "right", fontFamily: "monospace" }}>
                            NT$ {(Number(r.amountMinor) / 100).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {effectiveRows.length > 15 && (
                    <div style={{ textAlign: "center", fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                      ... 尚有 {effectiveRows.length - 15} 筆交易未全部展開
                    </div>
                  )}
                </div>
              </div>
            )}

            {errorMsg && (
              <div style={{ color: "var(--expense)", fontSize: 12, marginBottom: 14 }}>
                ⚠️ {errorMsg}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" className="btn ghost" onClick={onClose}>
                取消
              </button>
              <button
                type="button"
                className="btn"
                disabled={effectiveRows.length === 0 || importMutation.isPending || !accountId}
                onClick={async () => {
                  await importMutation.mutateAsync({
                    accountId,
                    transactions: effectiveRows.map((r) => ({
                      occurredAt: r.occurredAt,
                      amountMinor: r.amountMinor,
                      type: r.type,
                      note: r.note,
                      currency: "TWD",
                    })),
                  });
                }}
              >
                {importMutation.isPending ? "檢查與匯入中…" : `開始匯入 (${effectiveRows.length} 筆)`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
