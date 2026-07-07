"use client";

import { TopBar } from "@/components/TopBar";
import { useSession } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function CategoriesPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const utils = trpc.useUtils();

  const categories = trpc.categories.list.useQuery(undefined, { enabled: !!session?.user });
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"income" | "expense">("expense");
  const [error, setError] = useState<string | null>(null);

  const create = trpc.categories.create.useMutation({
    onSuccess: async () => {
      await utils.categories.list.invalidate();
      setName("");
      setError(null);
    },
    onError: (e) => setError(e.message),
  });

  const seedDefaults = trpc.categories.seedDefaults.useMutation({
    onSuccess: () => utils.categories.list.invalidate(),
  });

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

  const income = (categories.data ?? []).filter((c) => c.kind === "income");
  const expense = (categories.data ?? []).filter((c) => c.kind === "expense");

  return (
    <>
      <TopBar />
      <div className="container">
        <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ marginTop: 0 }}>分類管理</h2>
          <button
            type="button"
            className="btn ghost"
            onClick={() => seedDefaults.mutate()}
            disabled={seedDefaults.isPending}
          >
            {seedDefaults.isPending ? "補上中…" : "補上預設分類"}
          </button>
        </div>
        <p className="muted" style={{ margin: "0 0 20px" }}>
          記帳時使用的收入／支出分類，依群組（如飲食、交通）組織，方便分區選取。可自行新增或改名。
        </p>

        <form
          className="card"
          style={{ maxWidth: 420 }}
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            create.mutate({ name, kind });
          }}
        >
          <div className="seg">
            <button
              type="button"
              className={kind === "expense" ? "active" : ""}
              onClick={() => setKind("expense")}
            >
              支出
            </button>
            <button
              type="button"
              className={kind === "income" ? "active" : ""}
              onClick={() => setKind("income")}
            >
              收入
            </button>
          </div>
          <label>
            分類名稱
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="btn" disabled={create.isPending}>
            {create.isPending ? "新增中…" : "新增分類"}
          </button>
        </form>

        <div className="grid cols-2" style={{ marginTop: 24 }}>
          <div>
            <div className="section-title">支出</div>
            <CategoryList items={expense} />
          </div>
          <div>
            <div className="section-title">收入</div>
            <CategoryList items={income} />
          </div>
        </div>
      </div>
    </>
  );
}

function CategoryList({ items }: { items: { id: string; name: string; parentId: string | null }[] }) {
  const utils = trpc.useUtils();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const update = trpc.categories.update.useMutation({
    onSuccess: async () => {
      await utils.categories.list.invalidate();
      setEditingId(null);
    },
  });
  const remove = trpc.categories.delete.useMutation({
    onSuccess: () => utils.categories.list.invalidate(),
  });

  if (items.length === 0) return <div className="muted">尚無分類</div>;

  const row = (c: { id: string; name: string }, indent = false) => {
    const editing = editingId === c.id;
    return (
      <div className="row" key={c.id} style={indent ? { paddingLeft: 28 } : undefined}>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) update.mutate({ id: c.id, name: draft.trim() });
              if (e.key === "Escape") setEditingId(null);
            }}
            style={{ flex: 1 }}
          />
        ) : (
          <span className={indent ? "secondary" : "primary"}>
            {indent ? "— " : ""}
            {c.name}
          </span>
        )}
        <div className="row-inline">
          {editing ? (
            <>
              <button
                type="button"
                className="btn ghost"
                onClick={() => draft.trim() && update.mutate({ id: c.id, name: draft.trim() })}
                disabled={update.isPending}
              >
                儲存
              </button>
              <button type="button" className="btn ghost" onClick={() => setEditingId(null)}>
                取消
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setEditingId(c.id);
                  setDraft(c.name);
                }}
              >
                改名
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  if (confirm(`刪除分類「${c.name}」？既有紀錄會變成未分類。`)) {
                    remove.mutate({ id: c.id });
                  }
                }}
              >
                刪除
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  const parents = items.filter((c) => !c.parentId);
  const children = items.filter((c) => c.parentId);
  const orphans = children.filter((c) => !parents.some((p) => p.id === c.parentId));

  return (
    <div className="list">
      {parents.map((p) => (
        <div key={p.id}>
          {row(p)}
          {children.filter((c) => c.parentId === p.id).map((c) => row(c, true))}
        </div>
      ))}
      {orphans.map((c) => row(c))}
    </div>
  );
}
