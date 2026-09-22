"use client";

import { useState, useRef } from "react";
import { TopBar } from "@/components/TopBar";
import { SkeletonList } from "@/components/Skeleton";
import { Amount } from "@/components/Amount";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { trpc } from "@/lib/trpc";
import { fmtDate } from "@/lib/format";
import { niceConfirm } from "@/lib/confirm";

export default function AttachmentsPage() {
  const { ready } = useAuthGuard();
  const utils = trpc.useUtils();

  const [filter, setFilter] = useState<"all" | "unlinked" | "linked">("all");
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadNote, setUploadNote] = useState("");
  const [selectedTxId, setSelectedTxId] = useState<string>("");
  const [linkingAttachmentId, setLinkingAttachmentId] = useState<string | null>(null);
  const [txSearchTerm, setTxSearchTerm] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const attachmentsQuery = trpc.attachments.list.useQuery(undefined, {
    enabled: ready,
  });

  const recentTxQuery = trpc.transactions.list.useQuery(
    { limit: 50 },
    { enabled: ready }
  );

  const linkMutation = trpc.attachments.link.useMutation({
    onSuccess: async () => {
      await utils.attachments.list.invalidate();
      await utils.transactions.list.invalidate();
      setLinkingAttachmentId(null);
    },
  });

  const deleteMutation = trpc.attachments.delete.useMutation({
    onSuccess: async () => {
      await utils.attachments.list.invalidate();
      await utils.transactions.list.invalidate();
    },
  });

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      if (uploadNote) formData.append("note", uploadNote);
      if (selectedTxId) formData.append("transactionId", selectedTxId);

      const res = await fetch("/api/attachments", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "上傳失敗");
      }

      setSelectedFile(null);
      setUploadNote("");
      setSelectedTxId("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await utils.attachments.list.invalidate();
      await utils.transactions.list.invalidate();
    } catch (err: any) {
      setUploadError(err.message || "上傳時發生錯誤");
    } finally {
      setUploading(false);
    }
  };

  const rawAttachments = attachmentsQuery.data ?? [];

  const filteredAttachments = rawAttachments.filter((att) => {
    if (filter === "unlinked" && att.transactionId) return false;
    if (filter === "linked" && !att.transactionId) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = att.filename.toLowerCase().includes(q);
      const matchNote = att.note?.toLowerCase().includes(q);
      const matchTxNote = att.txNote?.toLowerCase().includes(q);
      return matchName || matchNote || matchTxNote;
    }
    return true;
  });

  const unlinkedCount = rawAttachments.filter((a) => !a.transactionId).length;
  const linkedCount = rawAttachments.filter((a) => !!a.transactionId).length;

  const rawTxItems = recentTxQuery.data?.items ?? [];
  const selectableTransactions = rawTxItems.filter((tx) => {
    if (!txSearchTerm.trim()) return true;
    const term = txSearchTerm.toLowerCase();
    return (
      tx.accountName?.toLowerCase().includes(term) ||
      tx.categoryName?.toLowerCase().includes(term) ||
      tx.note?.toLowerCase().includes(term)
    );
  });

  return (
    <>
      <TopBar />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 8px 0" }}>
            📁 單據與帳單管理
          </h1>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: 14 }}>
            集中上傳瓦斯、水電費帳單 PDF、發票或收據，並可隨時串聯至對應的收支交易紀錄。
          </p>
        </div>

        {/* Upload Card */}
        <div
          className="ff3-card"
          style={{
            padding: "20px 24px",
            marginBottom: 28,
            background: "linear-gradient(180deg, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.7) 100%)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <span>📤 上傳新檔案</span>
            <span style={{ fontSize: 12, fontWeight: 400, color: "var(--muted)" }}>
              (支援 PDF、JPG、PNG、WEBP 等單據格式，上限 25MB)
            </span>
          </div>

          <form onSubmit={handleUpload}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, marginBottom: 6, color: "var(--muted)" }}>
                  選擇檔案 *
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  required
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setSelectedFile(file);
                    if (file && !uploadNote) {
                      // Pre-fill note suggestion from filename without extension
                      const baseName = file.name.replace(/\.[^/.]+$/, "");
                      setUploadNote(baseName);
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "rgba(0,0,0,0.2)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, marginBottom: 6, color: "var(--muted)" }}>
                  單據備註 / 說明 (選填)
                </label>
                <input
                  type="text"
                  placeholder="例如：2026年3月瓦斯費繳費單"
                  value={uploadNote}
                  onChange={(e) => setUploadNote(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "rgba(0,0,0,0.2)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, marginBottom: 6, color: "var(--muted)" }}>
                  直接關聯交易 (選填，亦可稍後關聯)
                </label>
                <select
                  value={selectedTxId}
                  onChange={(e) => setSelectedTxId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "rgba(0,0,0,0.2)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                >
                  <option value="">暫不串聯 (稍後再連)</option>
                  {rawTxItems.slice(0, 30).map((tx) => (
                    <option key={tx.id} value={tx.id}>
                      {fmtDate(tx.occurredAt)} | {tx.accountName} | {Number(tx.amountMinor) / 100}元 | {tx.note || tx.categoryName || "無備註"}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {uploadError && (
              <div style={{ color: "var(--expense)", fontSize: 13, marginBottom: 12 }}>
                ⚠️ {uploadError}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="submit"
                className="btn"
                disabled={!selectedFile || uploading}
                style={{ minWidth: 120, padding: "8px 18px", fontSize: 13 }}
              >
                {uploading ? "上傳中…" : "確認上傳"}
              </button>
            </div>
          </form>
        </div>

        {/* Filters and Search */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className={`chip${filter === "all" ? " chip-on" : ""}`}
              onClick={() => setFilter("all")}
            >
              全部 ({rawAttachments.length})
            </button>
            <button
              type="button"
              className={`chip${filter === "unlinked" ? " chip-on" : ""}`}
              onClick={() => setFilter("unlinked")}
            >
              未串聯交易 ({unlinkedCount})
            </button>
            <button
              type="button"
              className={`chip${filter === "linked" ? " chip-on" : ""}`}
              onClick={() => setFilter("linked")}
            >
              已串聯交易 ({linkedCount})
            </button>
          </div>

          <div style={{ minWidth: 220 }}>
            <input
              type="text"
              placeholder="🔍 搜尋檔名或備註…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: "6px 12px",
                fontSize: 13,
                borderRadius: 6,
                background: "rgba(0,0,0,0.2)",
                border: "1px solid var(--border)",
                width: "100%",
              }}
            />
          </div>
        </div>

        {/* Attachments List */}
        {attachmentsQuery.isLoading ? (
          <SkeletonList rows={4} />
        ) : filteredAttachments.length === 0 ? (
          <div
            className="ff3-card"
            style={{
              padding: "48px 24px",
              textAlign: "center",
              color: "var(--muted)",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>📑</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--fg)", marginBottom: 4 }}>
              目前沒有符合條件的單據
            </div>
            <div style={{ fontSize: 13 }}>
              您可以透過上方上傳瓦斯費單據、發票或收據。
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filteredAttachments.map((att) => {
              const isPdf = att.contentType === "application/pdf" || att.filename.endsWith(".pdf");
              const sizeFormatted =
                att.sizeBytes > 1024 * 1024
                  ? `${(att.sizeBytes / (1024 * 1024)).toFixed(2)} MB`
                  : `${(att.sizeBytes / 1024).toFixed(0)} KB`;

              const isLinkingThis = linkingAttachmentId === att.id;

              return (
                <div
                  key={att.id}
                  className="ff3-card"
                  style={{
                    padding: "16px 20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    border: att.transactionId
                      ? "1px solid rgba(255,255,255,0.08)"
                      : "1px solid rgba(234, 179, 8, 0.25)",
                    background: att.transactionId
                      ? "var(--card-bg)"
                      : "rgba(234, 179, 8, 0.02)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 12,
                    }}
                  >
                    {/* File info */}
                    <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 260, flex: 1 }}>
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 8,
                          background: isPdf ? "rgba(239, 68, 68, 0.15)" : "rgba(56, 189, 248, 0.15)",
                          color: isPdf ? "#ef4444" : "#38bdf8",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 20,
                          fontWeight: 700,
                        }}
                      >
                        {isPdf ? "PDF" : "IMG"}
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <a
                          href={`/api/attachments/${att.id}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            fontSize: 15,
                            fontWeight: 600,
                            color: "#38bdf8",
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                          title="點擊預覽或下載檔案"
                        >
                          {att.filename}
                          <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400 }}>
                            ↗
                          </span>
                        </a>

                        <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span>📦 {sizeFormatted}</span>
                          <span>• 📅 {fmtDate(att.createdAt)}</span>
                          {att.note && <span style={{ color: "var(--fg)" }}>• 📝 {att.note}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <a
                        href={`/api/attachments/${att.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn ghost"
                        style={{ fontSize: 12, padding: "5px 10px", textDecoration: "none" }}
                      >
                        預覽 / 下載
                      </a>

                      <button
                        type="button"
                        className="btn ghost"
                        style={{ fontSize: 12, padding: "5px 10px", color: "var(--expense)" }}
                        disabled={deleteMutation.isPending}
                        onClick={async () => {
                          const ok = await niceConfirm(
                            "刪除檔案",
                            `確定要永久刪除單據「${att.filename}」嗎？此操作無法復原。`,
                            "danger"
                          );
                          if (ok) {
                            await deleteMutation.mutateAsync({ id: att.id });
                          }
                        }}
                      >
                        刪除
                      </button>
                    </div>
                  </div>

                  {/* Transaction Link Status */}
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: 6,
                      background: "rgba(0,0,0,0.2)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 10,
                    }}
                  >
                    {att.transactionId ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
                        <span
                          style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            background: "rgba(53, 196, 141, 0.15)",
                            color: "var(--income)",
                            borderRadius: 4,
                            fontWeight: 600,
                          }}
                        >
                          🔗 已串聯交易
                        </span>
                        <span>📅 {att.txOccurredAt ? fmtDate(att.txOccurredAt) : ""}</span>
                        {att.txAccountName && <span>🏦 {att.txAccountName}</span>}
                        {att.txAmountMinor !== null && att.txAmountMinor !== undefined && (
                          <span style={{ fontWeight: 600 }}>
                            <Amount
                              value={att.txAmountMinor}
                              currency={att.txCurrency ?? "TWD"}
                              kind={att.txType === "expense" ? "expense" : att.txType === "income" ? "income" : "neutral"}
                              signed={att.txType !== "transfer"}
                            />
                          </span>
                        )}
                        {att.txNote && <span style={{ color: "var(--muted)" }}>({att.txNote})</span>}
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#eab308" }}>
                        <span>⚠️ 尚未串聯任何交易紀錄</span>
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 8 }}>
                      {att.transactionId ? (
                        <button
                          type="button"
                          className="btn ghost"
                          style={{ fontSize: 12, padding: "3px 8px" }}
                          disabled={linkMutation.isPending}
                          onClick={async () => {
                            const ok = await niceConfirm(
                              "解除串聯",
                              "確定要將這張單據與此筆交易解除串聯嗎？",
                              "warning"
                            );
                            if (ok) {
                              await linkMutation.mutateAsync({
                                attachmentId: att.id,
                                transactionId: null,
                              });
                            }
                          }}
                        >
                          解除串聯
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn ghost"
                          style={{ fontSize: 12, padding: "3px 10px", color: "var(--primary)" }}
                          onClick={() => {
                            setLinkingAttachmentId(isLinkingThis ? null : att.id);
                            setTxSearchTerm("");
                          }}
                        >
                          {isLinkingThis ? "收合選單" : "🔗 選擇交易串聯"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline Transaction Linking Picker */}
                  {isLinkingThis && (
                    <div
                      style={{
                        padding: "12px 14px",
                        background: "rgba(30, 41, 59, 0.7)",
                        borderRadius: 6,
                        border: "1px solid rgba(99, 102, 241, 0.3)",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "#a5b4fc" }}>
                        請選擇欲與「{att.filename}」串聯的交易：
                      </div>

                      <div style={{ marginBottom: 10 }}>
                        <input
                          type="text"
                          placeholder="搜尋交易（帳戶、分類、備註）…"
                          value={txSearchTerm}
                          onChange={(e) => setTxSearchTerm(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "6px 10px",
                            fontSize: 12,
                            borderRadius: 4,
                            background: "rgba(0,0,0,0.3)",
                            border: "1px solid var(--border)",
                          }}
                        />
                      </div>

                      <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                        {selectableTransactions.length === 0 ? (
                          <div style={{ fontSize: 12, color: "var(--muted)", padding: 8, textAlign: "center" }}>
                            查無相關交易
                          </div>
                        ) : (
                          selectableTransactions.slice(0, 20).map((tx) => (
                            <div
                              key={tx.id}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "6px 10px",
                                background: "rgba(0,0,0,0.2)",
                                borderRadius: 4,
                                fontSize: 12,
                                cursor: "pointer",
                              }}
                              onClick={async () => {
                                await linkMutation.mutateAsync({
                                  attachmentId: att.id,
                                  transactionId: tx.id,
                                });
                              }}
                            >
                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <span style={{ color: "var(--muted)" }}>{fmtDate(tx.occurredAt)}</span>
                                <span style={{ fontWeight: 600 }}>{tx.accountName}</span>
                                <span>{tx.note || tx.categoryName || "無備註"}</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontFamily: "monospace", fontWeight: 700 }}>
                                  {Number(tx.amountMinor) / 100} {tx.currency}
                                </span>
                                <button
                                  type="button"
                                  className="btn"
                                  style={{ fontSize: 11, padding: "2px 8px" }}
                                  disabled={linkMutation.isPending}
                                >
                                  選擇此筆
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
