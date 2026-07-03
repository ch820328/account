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
        <h2 style={{ marginTop: 0 }}>分類管理</h2>
        <p className="muted" style={{ margin: "0 0 20px" }}>
          記帳時使用的收入／支出分類，可自行新增。
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
  if (items.length === 0) return <div className="muted">尚無分類</div>;
  const parents = items.filter((c) => !c.parentId);
  const children = items.filter((c) => c.parentId);

  return (
    <div className="list">
      {parents.map((p) => (
        <div key={p.id}>
          <div className="row">
            <span className="primary">{p.name}</span>
          </div>
          {children
            .filter((c) => c.parentId === p.id)
            .map((c) => (
              <div className="row" key={c.id} style={{ paddingLeft: 28 }}>
                <span className="secondary">— {c.name}</span>
              </div>
            ))}
        </div>
      ))}
      {children
        .filter((c) => !parents.some((p) => p.id === c.parentId))
        .map((c) => (
          <div className="row" key={c.id}>
            <span className="primary">{c.name}</span>
          </div>
        ))}
    </div>
  );
}
