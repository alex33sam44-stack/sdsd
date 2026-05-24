import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, Navigate } from "react-router-dom";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { authApi, tokenStore, ApiError } from "@/lib/api";
import { toast } from "sonner";
import { Bus, LogIn, UserPlus, Mail, Lock, User as UserIcon } from "lucide-react";
import { useAuth } from "@/modules/auth/useAuth";

type Mode = "signin" | "signup";
type RegistrationStatus = {
  passwordRegistrationEnabled: boolean;
  googleEnabled: boolean;
  delivery: string;
  missingSmtpFields: string[];
  reasons: Array<"smtp_unconfigured" | "email_delivery_unconfigured">;
};

const PENDING_INVITE_KEY = "app.pendingInviteToken";

const AuthPage = () => {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const { t } = useTranslation();
  const { user, memberships, loading } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [registrationStatus, setRegistrationStatus] = useState<RegistrationStatus | null>(null);

  const emailSchema = z.string().trim().email({ message: t("auth.invalidEmail") }).max(255);
  const passwordSchema = z.string().min(8, { message: t("auth.shortPassword") }).max(128);
  const nameSchema = z.string().trim().min(2, { message: t("auth.shortName") }).max(80);

  useEffect(() => {
    const url = new URL(window.location.href);
    const inviteToken = url.searchParams.get("invite") || url.searchParams.get("invitation");
    if (inviteToken) {
      sessionStorage.setItem(PENDING_INVITE_KEY, inviteToken);
    }
    const at = url.searchParams.get("access_token");
    const rt = url.searchParams.get("refresh_token");
    if (at && rt) {
      tokenStore.set(at, rt);
      url.searchParams.delete("access_token");
      url.searchParams.delete("refresh_token");
      window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
      toast.success(t("auth.signedIn"));
    }
  }, [t]);

  // Probe whether password registration is currently usable so the UI can
  // disable the email/password form and steer the user towards Google sign-in
  // before they hit a 503. Failure of this probe is non-fatal — we keep the
  // optimistic UI so a transient network blip never hides the form.
  useEffect(() => {
    let cancelled = false;
    authApi
      .registrationStatus()
      .then((status) => {
        if (!cancelled) setRegistrationStatus(status);
      })
      .catch(() => {
        // Backend doesn't expose the endpoint yet, or network failed: stay
        // optimistic. The submit handler will still surface a clear toast.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const passwordSignupDisabled =
    mode === "signup" &&
    registrationStatus !== null &&
    registrationStatus.passwordRegistrationEnabled === false;

  const pendingInvite = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(PENDING_INVITE_KEY) : null;
  const targetAfterAuth = pendingInvite ? `/tenant/setup?invite=${encodeURIComponent(pendingInvite)}` : (memberships.length === 0 ? "/tenant/setup" : (location.state?.from ?? "/"));

  if (loading) return null;
  if (user) return <Navigate to={targetAfterAuth} replace />;

  function describeError(err: unknown): string {
    if (err instanceof ApiError) {
      const body = err.body as
        | { message?: string | string[]; errorCode?: string; missingFields?: string[] }
        | null;
      // Backend now tags SMTP misconfig with a stable code; map it to a
      // friendly message that nudges the user toward Google sign-in.
      if (body?.errorCode === "smtp_unconfigured" || body?.errorCode === "email_delivery_unconfigured") {
        return t("auth.passwordRegDisabled");
      }
      const m = body?.message;
      if (Array.isArray(m)) return m.join("، ");
      if (typeof m === "string") return m;
      if (err.status === 401) return t("auth.invalidCredentials");
      if (err.status === 403) return t("auth.emailNotVerified");
      if (err.status === 409) return t("auth.emailTaken");
      if (err.status === 503) return t("auth.passwordRegDisabled");
    }
    if (err instanceof Error) return err.message;
    return t("auth.unexpected");
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordSignupDisabled) {
      toast.error(t("auth.passwordRegDisabled"));
      return;
    }
    const emailParse = emailSchema.safeParse(email);
    if (!emailParse.success) return toast.error(emailParse.error.errors[0].message);
    const passParse = passwordSchema.safeParse(password);
    if (!passParse.success) return toast.error(passParse.error.errors[0].message);

    setBusy(true);
    try {
      if (mode === "signup") {
        const nameParse = nameSchema.safeParse(displayName);
        if (!nameParse.success) {
          setBusy(false);
          return toast.error(nameParse.error.errors[0].message);
        }
        await authApi.register(emailParse.data, passParse.data, nameParse.data);
        toast.success(t("auth.createdMsg"));
        setMode("signin");
        setPassword("");
        return;
      } else {
        await authApi.login(emailParse.data, passParse.data);
        toast.success(t("auth.signedIn"));
        navigate(targetAfterAuth, { replace: true });
      }
    } catch (err) {
      toast.error(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const signInWithGoogle = () => {
    try {
      authApi.startGoogle();
    } catch (err) {
      toast.error(describeError(err));
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background grid place-items-center px-5">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="h-16 w-16 grid place-items-center rounded-2xl bg-primary border-2 border-secondary shadow-tactile mb-3">
            <Bus className="w-8 h-8 text-secondary" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-black text-secondary">
            {mode === "signin" ? t("auth.signin") : t("auth.signup")}
          </h1>
          <p className="text-sm font-semibold text-muted-foreground mt-1">
            {mode === "signin" ? t("auth.signinHint") : t("auth.signupHint")}
          </p>
          {pendingInvite && (
            <p className="text-xs font-bold text-secondary mt-2 text-center">
              لديك دعوة معلقة. بعد تسجيل الدخول سيتم نقلك إلى صفحة الانضمام إلى الجهة.
            </p>
          )}
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl border-2 border-secondary bg-surface p-5 shadow-tactile space-y-3"
        >
          {passwordSignupDisabled && (
            <div
              role="alert"
              className="rounded-lg border-2 border-secondary/40 bg-surface-alt px-3 py-2 text-xs font-bold text-muted-foreground leading-relaxed"
            >
              {t("auth.passwordRegDisabled")}
              {registrationStatus?.googleEnabled !== false && (
                <span> {t("auth.passwordRegDisabledGoogleHint")}</span>
              )}
            </div>
          )}
          {mode === "signup" && (
            <Field icon={<UserIcon className="w-4 h-4" />} label={t("auth.name")}>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="input-admin"
                maxLength={80}
                autoComplete="name"
              />
            </Field>
          )}
          <Field icon={<Mail className="w-4 h-4" />} label={t("auth.email")}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
              className="input-admin"
              maxLength={255}
              autoComplete="email"
              required
            />
          </Field>
          <Field icon={<Lock className="w-4 h-4" />} label={t("auth.password")}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              dir="ltr"
              className="input-admin"
              minLength={6}
              maxLength={128}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
            />
          </Field>

          <button
            type="submit"
            disabled={busy || passwordSignupDisabled}
            className="w-full h-12 rounded-lg border-2 border-secondary bg-secondary text-secondary-foreground font-black flex items-center justify-center gap-2 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform disabled:opacity-60"
          >
            {mode === "signin" ? <LogIn className="w-5 h-5" strokeWidth={2.5} /> : <UserPlus className="w-5 h-5" strokeWidth={2.5} />}
            {mode === "signin" ? t("auth.signin") : t("auth.createAccount")}
          </button>

          <div className="flex items-center gap-2 my-1">
            <div className="flex-1 h-px bg-secondary/20" />
            <span className="text-[11px] font-bold text-muted-foreground">{t("common.or")}</span>
            <div className="flex-1 h-px bg-secondary/20" />
          </div>

          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={busy}
            className="w-full h-12 rounded-lg border-2 border-secondary bg-surface text-secondary font-black flex items-center justify-center gap-2 shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform disabled:opacity-60"
          >
            <GoogleIcon />
            <span>{t("auth.continueGoogle")}</span>
          </button>
        </form>

        <p className="text-center text-sm font-semibold text-muted-foreground mt-4">
          {mode === "signin" ? t("auth.noAccount") : t("auth.haveAccount")} {" "}
          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="text-secondary font-black underline"
          >
            {mode === "signin" ? t("auth.signup") : t("auth.signin")}
          </button>
        </p>

        <Link
          to="/"
          className="block text-center text-xs font-bold text-muted-foreground underline mt-4"
        >
          {t("auth.guest")}
        </Link>
      </div>
    </div>
  );
};

const Field = ({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <div>
    <label className="flex items-center gap-1.5 text-xs font-black text-secondary mb-1.5">
      <span className="text-muted-foreground">{icon}</span> {label}
    </label>
    {children}
  </div>
);

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" fill="#34A853"/>
    <path d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.95l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" fill="#EA4335"/>
  </svg>
);

export default AuthPage;
