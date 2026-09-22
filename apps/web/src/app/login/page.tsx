"use client";

import { signIn } from "@/lib/auth-client";
import { normalizeUsername } from "@/lib/auth-credentials";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
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
      const res = await signIn.username({ username: id, password });
      if (res.error) {
        setError(res.error.message ?? "帳號或密碼錯誤");
        return;
      }
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "發生錯誤");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container center">
      <form className="card auth-card" onSubmit={submit}>
        <div className="brand" style={{ marginBottom: 16, textAlign: "center" }}>
          登入
        </div>

        <label>
          帳號
          <input
            type="text"
            required
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="sepan"
            pattern="[a-zA-Z0-9_-]{3,32}"
            title="3–32 字元，僅限英文、數字、底線、連字號"
          />
        </label>
        <label>
          密碼
          <input
            type="password"
            required
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            minLength={5}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>

        {error && <div className="error">{error}</div>}

        <button className="btn" disabled={loading} style={{ marginTop: 8 }}>
          {loading ? "處理中…" : "登入"}
        </button>
      </form>
    </div>
  );
}
