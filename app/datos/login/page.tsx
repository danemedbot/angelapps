"use client";

import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
      const data = await response.json();
      if (!response.ok || data?.ok === false) throw new Error(data?.errors?.join(" ") || "No se pudo iniciar sesión.");
      window.location.href = new URLSearchParams(window.location.search).get("next") || "/datos";
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar sesión.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="login-shell"><form className="login-card" onSubmit={submit}><p className="eyebrow">DANEMED</p><h1>Acceso requerido</h1><p>Inicia sesión para usar el organizador de datos.</p><label className="field"><span>Usuario</span><input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} /></label><label className="field"><span>Contraseña</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>{error && <div className="error-box">{error}</div>}<button className="primary" disabled={busy}>{busy ? "Entrando..." : "Entrar"}</button></form></main>;
}
