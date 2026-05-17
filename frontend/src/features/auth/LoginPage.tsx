import { FormEvent, useState } from "react";
import { LockKeyhole, Video } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function LoginPage() {
  const { login, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (token) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await login(email, password);
      const fallback = "/dashboard";
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(from ?? fallback, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="brand-lockup">
          <span className="brand-mark">
            <Video size={26} />
          </span>
          <div>
            <h1>Camera NVR</h1>
            <p>Monitoramento local via RTSP</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label>
            Senha
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error ? <div className="form-error">{error}</div> : null}

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            <LockKeyhole size={18} />
            {isSubmitting ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
