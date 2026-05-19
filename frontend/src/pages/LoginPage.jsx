import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <main className="login">
      <form className="panel login-box" onSubmit={submit} autoComplete="off">
        <h1>Marketing ERP</h1>
        <label>Email<input name="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input name="password" autoComplete="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        <button>Sign in</button>
      </form>
    </main>
  );
}
