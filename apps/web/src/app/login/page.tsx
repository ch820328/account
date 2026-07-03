"use client";

import { signIn, signUp } from "@/lib/auth-client";
import { normalizeUsername, usernameToInternalEmail } from "@/lib/auth-credentials";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const id = normalizeUsername(username);
      const res =
        mode === "signin"
          ? await signIn.username({ username: id, password })
          : await signUp.email({
              email: usernameToInternalEmail(id),
              username: id,
              password,
              name: name || id,
            });
      if (res.error) {
        setError(res.error.message ?? "發生錯誤");
        return;
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "發生錯誤");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container center">
      <form className="card auth-card" onSubmit={submit}>
        <div className="brand" style={{ marginBottom: 4 }}>
          {mode === "signin" ? "登入" : "建立帳號"}
        </div>
        <div className="seg" style={{ marginBottom: 8 }}>
          <button type="button" className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")}>
            登入
          </button>
          <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>
            註冊
          </button>
        </div>

        {mode === "signup" && (
          <label>
            名稱
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="你的名字" />
          </label>
        )}
        <label>
          帳號
          <input
            type="text"
            required
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
            pattern="[a-zA-Z0-9_-]{3,32}"
            title="3–32 字元，僅限英文、數字、底線、連字號"
          />
        </label>
        <label>
          密碼
          <input
            type="password"
            required
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            minLength={5}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signin" ? "admin" : "至少 5 碼"}
          />
        </label>

        {mode === "signin" && (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            預設帳號 admin / admin
          </p>
        )}

        {error && <div className="error">{error}</div>}

        <button className="btn" disabled={loading}>
          {loading ? "處理中…" : mode === "signin" ? "登入" : "註冊"}
        </button>
      </form>
    </div>
  );
}
