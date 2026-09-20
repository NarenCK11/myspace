import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorCode, errorMessage } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";

export function LoginPage() {
  const { login, status } = useAuth();
  const location = useLocation();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const idRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    idRef.current?.focus();
  }, []);

  if (status === "authenticated") {
    const from = (location.state as { from?: string } | null)?.from ?? "/";
    return <Navigate to={from} replace />;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setRateLimited(false);
    setSubmitting(true);
    try {
      await login(loginId.trim(), password);
    } catch (caught) {
      setError(errorMessage(caught, "Could not sign in."));
      setRateLimited(errorCode(caught) === "rate_limited");
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* Ambient background wash. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-52 right-[-6rem] size-[28rem] rounded-full bg-info/10 blur-3xl"
      />

      <main className="relative w-full max-w-sm animate-fade-up">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-raised">
            <svg viewBox="0 0 24 24" className="size-6" fill="none" aria-hidden>
              <path
                d="M6 17V8l6 5 6-5v9"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to your private portal.</p>
        </div>

        <form onSubmit={submit} className="card-surface space-y-4 p-6 shadow-raised">
          <div className="space-y-1.5">
            <Label htmlFor="login-id">ID</Label>
            <Input
              id="login-id"
              ref={idRef}
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={64}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="login-password">Password</Label>
            <div className="relative">
              <Input
                id="login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger"
            >
              {error}
              {rateLimited && " Too many attempts have been made from this device."}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" loading={submitting}>
            {submitting ? "Signing in" : "Sign in"}
          </Button>
        </form>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-2xs text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          Private portal — single account, no registration.
        </p>
      </main>
    </div>
  );
}

export function AuthLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  );
}
