"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@sekel/db";
import { supabase } from "@/lib/supabase/client";
import "./page.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: authError } = await signIn(supabase, email, password);
    if (authError) {
      setError("Invalid email or password");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="login">
      <div className="login__card">
        <h1 className="login__title">Dashboard Login</h1>
        <p className="login__subtitle">Admin access only</p>

        <form onSubmit={handleSubmit} className="login__form">
          <div className="login__field">
            <label htmlFor="email" className="login__label">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className="login__input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="login__field">
            <label htmlFor="password" className="login__label">Password</label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              className="login__input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p className="login__error">{error}</p>}

          <button type="submit" className="login__btn" disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
