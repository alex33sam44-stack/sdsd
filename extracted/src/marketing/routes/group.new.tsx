import { createFileRoute, Link, useRouter } from "@/marketing/routerCompat";
import { useState } from "react";
import { ArrowRight, Loader2, Users, MapPin, Clock, Bus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/marketing/hooks/useAuth";
import { createGroupTrip } from "@/marketing/lib/groupTrips";

export const Route = createFileRoute("/group/new")({
  component: NewGroupTripPage,
  head: () => ({
    meta: [
      { title: "ابدأ رحلة جماعية — مواصلات" },
      { name: "description", content: "اعمل رحلة جماعية وشيّر اللينك علي واتساب — صحابك يضغطوا 'أنا كمان'" },
    ],
  }),
});

function NewGroupTripPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!loading && !user) {
    router.navigate({ to: "/login" });
    return null;
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr(null);
    const f = new FormData(e.currentTarget);
    const title = String(f.get("title") || "").trim();
    const from_location = String(f.get("from") || "").trim();
    const to_location = String(f.get("to") || "").trim();
    const transport = String(f.get("transport") || "").trim() || undefined;
    const depart_at_local = String(f.get("when") || "");
    const notes = String(f.get("notes") || "").trim() || undefined;

    if (!title || !from_location || !to_location || !depart_at_local) {
      setErr("املأ كل الحقول المطلوبة"); return;
    }
    setBusy(true);
    try {
      const token = await createGroupTrip({
        title, from_location, to_location, transport,
        depart_at: new Date(depart_at_local).toISOString(),
        notes,
      });
      router.navigate({ to: "/g/$token", params: { token } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذر إنشاء الرحلة");
    } finally { setBusy(false); }
  };

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset() + 30);
  const minDateTime = now.toISOString().slice(0, 16);

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-violet-50 via-white to-sky-50">
      <header className="border-b bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-slate-700"><ArrowRight className="h-4 w-4" /> رجوع</Link>
          <h1 className="font-bold text-slate-900 flex items-center gap-2"><Users className="h-5 w-5 text-violet-600" /> رحلة جماعية</h1>
          <div className="w-12" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <div className="rounded-2xl border bg-white shadow-sm p-5">
          <p className="text-sm text-slate-600 mb-4">
            اعمل رحلة، شيّر اللينك على واتساب، وكل اللي يضغطوا "أنا كمان" حيظهروا للكل 💪
          </p>
          <form onSubmit={onSubmit} className="space-y-3">
            <Field label="عنوان الرحلة *" icon={<Bus className="h-4 w-4" />}>
              <input name="title" required maxLength={120} placeholder="مثلاً: رايح التجمع الساعة 9"
                className="w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-violet-300" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="من *" icon={<MapPin className="h-4 w-4" />}>
                <input name="from" required maxLength={120} placeholder="رمسيس"
                  className="w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-violet-300" />
              </Field>
              <Field label="إلى *" icon={<MapPin className="h-4 w-4" />}>
                <input name="to" required maxLength={120} placeholder="التجمع الخامس"
                  className="w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-violet-300" />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="الميعاد *" icon={<Clock className="h-4 w-4" />}>
                <input type="datetime-local" name="when" required min={minDateTime}
                  className="w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-violet-300" />
              </Field>
              <Field label="وسيلة المواصلة" icon={<Bus className="h-4 w-4" />}>
                <input name="transport" maxLength={60} placeholder="ميكروباص / مترو / أوبر شير"
                  className="w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-violet-300" />
              </Field>
            </div>
            <Field label="ملاحظات">
              <textarea name="notes" maxLength={500} rows={2} placeholder="أي تفاصيل إضافية (مكان اللقاء، التكلفة، ...)"
                className="w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-violet-300" />
            </Field>
            {err && <p className="text-sm text-rose-600">{err}</p>}
            <Button type="submit" disabled={busy} size="lg" className="w-full gap-2 bg-violet-600 hover:bg-violet-700">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
              اعمل الرحلة وهات اللينك
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-700 flex items-center gap-1 mb-1">{icon}{label}</span>
      {children}
    </label>
  );
}


export default Route.component;
