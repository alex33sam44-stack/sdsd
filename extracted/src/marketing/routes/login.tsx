import { createFileRoute, Link, useNavigate } from "@/marketing/routerCompat";
import { useEffect, useState } from "react";
import { Bus, Gift, Loader2 } from "lucide-react";
import { dataClient } from "@/marketing/integrations/data/client";
import { lovable } from "@/marketing/integrations/lovable/index";
import { useAuth } from "@/marketing/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { captureRefFromUrl, clearPendingRef, getPendingRef } from "@/marketing/lib/referrals";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "تسجيل الدخول — مواصلات" }] }),
});

function LoginPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [refCode, setRefCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    captureRefFromUrl();
    const pending = getPendingRef();
    if (pending) setRefCode(pending);
  }, []);

  useEffect(() => {
    if (user) { clearPendingRef(); navigate({ to: "/" }); }
  }, [user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await dataClient.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: refCode ? { ref: refCode.toUpperCase() } : undefined,
          },
        });
        if (error) throw error;
      } else {
        const { error } = await dataClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      setError(err?.message ?? "حصل خطأ");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) {
      setError(result.error.message ?? "تعذر تسجيل الدخول بجوجل");
      setBusy(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-sky-50 to-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-center gap-2">
          <div className="rounded-lg bg-sky-500 p-2 text-white"><Bus className="h-5 w-5" /></div>
          <h1 className="text-xl font-bold text-slate-900">مواصلات</h1>
        </div>
        <h2 className="text-center text-base font-semibold text-slate-800">
          {mode === "signin" ? "سجّل دخولك" : "أنشئ حساب جديد"}
        </h2>
        <p className="mt-1 text-center text-xs text-slate-500">
          عشان تقدر تضيف محطات وتأكدها
        </p>

        <Button onClick={google} disabled={busy} variant="outline" className="mt-5 w-full">
          الدخول بحساب جوجل
        </Button>

        <div className="my-4 flex items-center gap-2 text-xs text-slate-400">
          <div className="h-px flex-1 bg-slate-200" />
          أو
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            required
            placeholder="البريد الإلكتروني"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-sky-500"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="كلمة السر (6 حروف على الأقل)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-sky-500"
          />
          {mode === "signup" && (
            <div className="rounded-lg border border-fuchsia-200 bg-fuchsia-50 p-2.5">
              <label className="flex items-center gap-1.5 text-[11px] font-medium text-fuchsia-900">
                <Gift className="h-3 w-3" /> كود دعوة (اختياري — هتاخد 30 نقطة إضافية)
              </label>
              <input
                value={refCode}
                onChange={(e) => setRefCode(e.target.value.toUpperCase())}
                placeholder="مثال: AB12CD"
                className="mt-1.5 w-full rounded-md border bg-white px-2 py-1.5 text-sm uppercase tracking-wider"
              />
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full bg-sky-600 hover:bg-sky-700">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (mode === "signin" ? "دخول" : "إنشاء حساب")}
          </Button>
        </form>

        <button
          onClick={() => { setError(null); setMode(mode === "signin" ? "signup" : "signin"); }}
          className="mt-4 w-full text-center text-xs text-sky-600 hover:underline"
        >
          {mode === "signin" ? "معندكش حساب؟ سجّل دلوقتي" : "عندك حساب بالفعل؟ سجّل دخول"}
        </button>

        <Link to="/" className="mt-3 block text-center text-xs text-slate-500 hover:underline">
          الرجوع للخريطة
        </Link>
      </div>
    </div>
  );
}


export default Route.component;
