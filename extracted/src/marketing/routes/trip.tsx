import { createFileRoute, Link, useNavigate } from "@/marketing/routerCompat";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Bus, Loader2, MapPin, Navigation, Share2, Square, Copy, Check, Radio } from "lucide-react";
import { useAuth } from "@/marketing/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  buildShareUrl,
  buildWhatsAppShare,
  trackTripShareCreated,
  endTrip,
  getActiveTrip,
  sendPing,
  startTrip,
  type Trip,
} from "@/marketing/lib/trips";

export const Route = createFileRoute("/trip")({
  component: TripPage,
  head: () => ({
    meta: [
      { title: "شيّر رحلتك — تتبع لحظي للأهل" },
      { name: "description", content: "ابعت لأهلك لينك يتابعوا بيه رحلتك في المواصلات لحظة بلحظة" },
    ],
  }),
});

function TripPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // form
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [transport, setTransport] = useState("");
  const [notes, setNotes] = useState("");

  // tracking
  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<number>(0);
  const [pingCount, setPingCount] = useState(0);
  const [lastErr, setLastErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const t = await getActiveTrip();
      setTrip(t);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطأ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/login" });
      return;
    }
    if (user) void reload();
  }, [authLoading, user, navigate, reload]);

  // Start watching geolocation when an active trip exists
  useEffect(() => {
    if (!trip) return;
    if (!("geolocation" in navigator)) {
      setLastErr("جهازك مش بيدعم تحديد الموقع");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        // throttle to one ping every 10s
        if (now - lastSentRef.current < 10_000) return;
        lastSentRef.current = now;
        sendPing(trip.id, pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy)
          .then(() => setPingCount((c) => c + 1))
          .catch((e) => setLastErr(e instanceof Error ? e.message : "تعذر إرسال الموقع"));
      },
      (e) => setLastErr(e.message),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    watchIdRef.current = id;
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    };
  }, [trip]);

  const onStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!from.trim() || !to.trim()) {
      setErr("اكتب نقطة البداية والوصول");
      return;
    }
    setBusy(true);
    try {
      const t = await startTrip({
        from_location: from,
        to_location: to,
        transport: transport || undefined,
        notes: notes || undefined,
      });
      setTrip(t);
      // try one immediate ping
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (p) => sendPing(t.id, p.coords.latitude, p.coords.longitude, p.coords.accuracy).catch(() => {}),
          () => {},
          { enableHighAccuracy: true, timeout: 10_000 },
        );
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذر بدء الرحلة");
    } finally {
      setBusy(false);
    }
  };

  const onEnd = async () => {
    if (!trip) return;
    if (!confirm("تأكيد إنهاء الرحلة؟")) return;
    setBusy(true);
    try {
      await endTrip(trip.id, "completed");
      setTrip(null);
      setPingCount(0);
      setFrom("");
      setTo("");
      setTransport("");
      setNotes("");
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!trip) return;
    try {
      await navigator.clipboard.writeText(buildShareUrl(trip.share_token));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link to="/"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 ml-1" />رجوع</Button></Link>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-emerald-500 p-2 text-white"><Navigation className="h-4 w-4" /></div>
            <h1 className="text-base font-bold text-slate-900">شيّر رحلتك</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : trip ? (
          <ActiveTripView
            trip={trip}
            pingCount={pingCount}
            lastErr={lastErr}
            copied={copied}
            onCopy={copyLink}
            onEnd={onEnd}
            busy={busy}
          />
        ) : (
          <form onSubmit={onStart} className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
            <div>
              <h2 className="text-lg font-bold text-slate-900">ابدأ رحلتك دلوقتي</h2>
              <p className="mt-1 text-sm text-slate-600">
                هتاخد لينك تبعته للأهل أو الصحاب، يقدروا يتابعوا موقعك لايف من غير ما يسجلوا في التطبيق.
              </p>
            </div>

            <div className="space-y-3">
              <Field label="من فين؟" icon={<MapPin className="h-4 w-4" />}>
                <input
                  required
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  placeholder="مثال: فيصل"
                  className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                />
              </Field>
              <Field label="لفين؟" icon={<MapPin className="h-4 w-4" />}>
                <input
                  required
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="مثال: التجمع الخامس"
                  className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                />
              </Field>
              <Field label="بأنهي مواصلة؟ (اختياري)" icon={<Bus className="h-4 w-4" />}>
                <input
                  value={transport}
                  onChange={(e) => setTransport(e.target.value)}
                  placeholder="مثال: ميكروباص"
                  className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                />
              </Field>
              <Field label="ملاحظة (اختياري)" icon={<Radio className="h-4 w-4" />}>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="مثال: لو متأخرت كلموني"
                  className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                />
              </Field>
            </div>

            {err && <p className="text-sm text-rose-600">{err}</p>}

            <Button type="submit" disabled={busy} className="w-full gap-2 bg-emerald-500 hover:bg-emerald-600">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
              ابدأ الرحلة و اطلع لينك المشاركة
            </Button>

            <p className="text-[11px] leading-relaxed text-slate-500">
              💡 موقعك بيتشار بس مع اللي عندهم اللينك، ولحد ما تنهي الرحلة بنفسك.
            </p>
          </form>
        )}
      </main>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-700">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}

function ActiveTripView({
  trip, pingCount, lastErr, copied, onCopy, onEnd, busy,
}: {
  trip: Trip;
  pingCount: number;
  lastErr: string | null;
  copied: boolean;
  onCopy: () => void;
  onEnd: () => void;
  busy: boolean;
}) {
  const shareUrl = buildShareUrl(trip.share_token);
  const waUrl = buildWhatsAppShare(trip.share_token, trip.from_location, trip.to_location);

  return (
    <div className="space-y-4">
      {/* Live status */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
          </span>
          <h2 className="text-base font-bold text-emerald-900">رحلتك شغّالة دلوقتي</h2>
        </div>
        <p className="mt-2 text-sm text-emerald-800">
          من <b>{trip.from_location}</b> إلى <b>{trip.to_location}</b>
          {trip.transport ? <> · {trip.transport}</> : null}
        </p>
        <p className="mt-2 text-xs text-emerald-700">
          تم إرسال {pingCount} تحديث موقع · آخر تحديث:{" "}
          {trip.last_ping_at ? new Date(trip.last_ping_at).toLocaleTimeString("ar-EG") : "—"}
        </p>
        {lastErr && <p className="mt-2 text-xs text-rose-600">⚠️ {lastErr}</p>}
      </div>

      {/* Share */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-3">
        <h3 className="flex items-center gap-2 font-bold text-slate-900">
          <Share2 className="h-4 w-4 text-sky-600" />
          ابعت الرحلة على واتساب
        </h3>

        <a
          href={waUrl}
          onClick={() => trackTripShareCreated(trip.share_token, "whatsapp")}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-3 text-sm font-bold text-white hover:opacity-90"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
            <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.8-1.6-2.1-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.6-1.5-.9-2.1-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.3-.7.3-1.3.2-1.4 0-.1-.3-.2-.6-.3zM12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.1-1.3c1.4.8 3.1 1.2 4.9 1.2 5.5 0 10-4.5 10-10S17.5 2 12 2z"/>
          </svg>
          ابعت للجروب على واتساب
        </a>

        <div className="flex items-stretch gap-2">
          <input
            readOnly
            value={shareUrl}
            className="flex-1 rounded-lg border bg-slate-50 px-3 py-2 text-xs text-slate-700"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button variant="outline" size="sm" onClick={onCopy} className="gap-1 shrink-0">
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            {copied ? "تم" : "نسخ"}
          </Button>
        </div>

        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold leading-relaxed text-emerald-900">
          نص واتساب جاهز باللهجة + لينك يفتح الرحلة مباشرة. ابعته للجروب أو للأهل يتابعوا مشوارك.
        </p>

        <Link
          to="/t/$token"
          params={{ token: trip.share_token }}
          target="_blank"
          className="block text-center text-xs text-sky-600 underline hover:text-sky-700"
        >
          افتح معاينة الرابط قبل ما تبعته
        </Link>
      </div>

      {/* End */}
      <Button
        variant="outline"
        onClick={onEnd}
        disabled={busy}
        className="w-full gap-2 border-rose-200 text-rose-700 hover:bg-rose-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
        وصلت — أنهي الرحلة
      </Button>
    </div>
  );
}


export default Route.component;
