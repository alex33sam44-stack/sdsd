import { createFileRoute, Link } from "@/marketing/routerCompat";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Eye, EyeOff, Image as ImageIcon, Loader2, MapPin, Plus, Route as RouteIcon, ThumbsDown, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shareStoryCard } from "@/marketing/lib/storyCard";
import { useAuth } from "@/marketing/hooks/useAuth";
import { dataClient } from "@/marketing/integrations/data/client";
import {
  ALERT_META, ALERT_TYPES,
  type Alert, type AlertType,
  alertMatchesRoute,
  confirmAlert, createAlert, disputeAlert, fetchAlerts, fetchMentionedAlertIds, fetchMyConfirmedAlerts, fetchMyDisputedAlerts, timeAgo,
} from "@/marketing/lib/alerts";
import { getActiveTrip, type Trip } from "@/marketing/lib/trips";

export const Route = createFileRoute("/alerts")({
  component: AlertsPage,
  head: () => ({
    meta: [
      { title: "بلاغات الطريق — اللي على طريقك بس" },
      { name: "description", content: "شوف البلاغات اللي على نفس طريقك دلوقتي أو اللي صحابك نبّهوك عليها" },
    ],
  }),
});

function AlertsPage() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [disputed, setDisputed] = useState<Set<string>>(new Set());
  const [mentioned, setMentioned] = useState<Set<string>>(new Set());
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, c, d, m, t] = await Promise.all([
        fetchAlerts(),
        fetchMyConfirmedAlerts(),
        fetchMyDisputedAlerts(),
        fetchMentionedAlertIds(),
        getActiveTrip().catch(() => null),
      ]);
      setAlerts(a);
      setConfirmed(c);
      setDisputed(d);
      setMentioned(m);
      setTrip(t);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const ch = dataClient
      .channel("alerts-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, () => void load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alert_confirmations" }, () => void load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alert_disputes" }, () => void load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alert_mentions" }, () => void load())
      .subscribe();
    return () => { void dataClient.removeChannel(ch); };
  }, [load]);

  const { onRoute, mentions, others } = useMemo(() => {
    const onRoute: Alert[] = [];
    const mentions: Alert[] = [];
    const others: Alert[] = [];
    for (const a of alerts) {
      const isMatch = trip ? alertMatchesRoute(a, trip) : false;
      const isMention = mentioned.has(a.id);
      if (isMention) mentions.push(a);
      else if (isMatch) onRoute.push(a);
      else others.push(a);
    }
    return { onRoute, mentions, others };
  }, [alerts, trip, mentioned]);

  const cardProps = (a: Alert) => ({
    alert: a,
    isOwner: user?.id === a.user_id,
    hasConfirmed: confirmed.has(a.id),
    hasDisputed: disputed.has(a.id),
    canConfirm: !!user && user.id !== a.user_id && !confirmed.has(a.id) && !disputed.has(a.id),
    canDispute: !!user && user.id !== a.user_id && !confirmed.has(a.id) && !disputed.has(a.id),
    onConfirmed: () => { setConfirmed((s) => new Set(s).add(a.id)); void load(); },
    onDisputed: () => { setDisputed((s) => new Set(s).add(a.id)); void load(); },
  });

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 ml-1" />رجوع</Button></Link>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-rose-500 p-2 text-white"><AlertTriangle className="h-4 w-4" /></div>
              <h1 className="text-base font-bold text-slate-900">بلاغات الطريق</h1>
            </div>
          </div>
          {user && (
            <Button size="sm" onClick={() => setShowForm((v) => !v)} className="gap-1 bg-rose-500 hover:bg-rose-600">
              {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showForm ? "إلغاء" : "بلّغ"}
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        {showForm && user && <AlertForm defaultLine={trip?.transport ?? ""} onDone={() => { setShowForm(false); void load(); }} />}

        {!user && (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
            🔑 <Link to="/login" className="underline font-bold">سجّل دخول</Link> عشان تشوف بلاغات طريقك وتبلّغ وتكسب نقاط.
          </div>
        )}

        {user && !trip && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            🚶 مش ماشي في رحلة دلوقتي.{" "}
            <Link to="/trip" className="underline font-bold">ابدأ رحلة</Link> عشان نوريك بلاغات طريقك بس.
          </div>
        )}

        {user && trip && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            <RouteIcon className="inline h-3.5 w-3.5 ml-1" />
            بنفلتر البلاغات على طريقك: <b>{trip.from_location}</b> ← <b>{trip.to_location}</b>
            {trip.transport && <> · {trip.transport}</>}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : (
          <>
            <Section
              title="🔔 صحابك نبّهوك"
              subtitle="بلاغات حد من المستخدمين نبّهك عليها"
              items={mentions}
              empty="مفيش حد نبّهك على بلاغ دلوقتي."
              cardProps={cardProps}
              hideWhenEmpty={!user}
            />

            <Section
              title="🛣️ على طريقك"
              subtitle={trip ? "بلاغات شغّالة على نفس مسارك" : "ابدأ رحلة عشان نوريك بلاغات طريقك"}
              items={onRoute}
              empty="مفيش بلاغات على طريقك دلوقتي — الطريق صافي 🌿"
              cardProps={cardProps}
              hideWhenEmpty={!trip}
            />

            <div className="flex items-center justify-between border-t pt-4">
              <p className="text-xs text-slate-500">
                {others.length > 0 && `+ ${others.length} بلاغ تاني على طرق مش طريقك`}
              </p>
              <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)} className="gap-1 text-xs">
                {showAll ? <><EyeOff className="h-3 w-3" /> اخفي البعيد</> : <><Eye className="h-3 w-3" /> اعرض كل البلاغات</>}
              </Button>
            </div>

            {showAll && (
              <Section
                title="🌍 كل البلاغات"
                subtitle="بلاغات على طرق تانية"
                items={others}
                empty="مفيش بلاغات تانية."
                cardProps={cardProps}
              />
            )}

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              🎁 كل بلاغ صحيح = <b>+3 نقاط</b> · كل تأكيد لبلاغ غيرك = <b>+1 نقطة</b>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Section({
  title, subtitle, items, empty, cardProps, hideWhenEmpty,
}: {
  title: string;
  subtitle?: string;
  items: Alert[];
  empty: string;
  cardProps: (a: Alert) => React.ComponentProps<typeof AlertCard>;
  hideWhenEmpty?: boolean;
}) {
  if (hideWhenEmpty && items.length === 0) return null;
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-bold text-slate-900">{title} <span className="text-xs font-normal text-slate-500">({items.length})</span></h2>
        {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
      </div>
      {items.length === 0 ? (
        <div className="rounded-2xl border bg-white p-6 text-center text-xs text-slate-500">{empty}</div>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => <AlertCard key={a.id} {...cardProps(a)} />)}
        </ul>
      )}
    </section>
  );
}

function AlertCard({ alert, isOwner, hasConfirmed, hasDisputed, canConfirm, canDispute, onConfirmed, onDisputed }: {
  alert: Alert;
  isOwner: boolean;
  hasConfirmed: boolean;
  hasDisputed: boolean;
  canConfirm: boolean;
  canDispute: boolean;
  onConfirmed: () => void;
  onDisputed: () => void;
}) {
  const meta = ALERT_META[alert.type];
  const [busy, setBusy] = useState<"confirm" | "dispute" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onConfirm = async () => {
    setBusy("confirm"); setErr(null);
    try { await confirmAlert(alert.id); onConfirmed(); }
    catch (e) { setErr(e instanceof Error ? e.message : "خطأ"); }
    finally { setBusy(null); }
  };

  const onDispute = async () => {
    if (!confirm("متأكد إن البلاغ ده مش صحيح؟ المُبلّغ هيخسر نقاط لو ناس تانية اتفقت معاك.")) return;
    setBusy("dispute"); setErr(null);
    try { await disputeAlert(alert.id); onDisputed(); }
    catch (e) { setErr(e instanceof Error ? e.message : "خطأ"); }
    finally { setBusy(null); }
  };

  const total = alert.confirmations_count + alert.disputes_count;
  const trustPct = total > 0 ? Math.round((alert.confirmations_count / total) * 100) : null;
  const isShaky = alert.disputes_count > 0 && (trustPct ?? 100) < 60;

  return (
    <li className={`rounded-xl border p-4 ${meta.color} ${isShaky ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="text-xl leading-none">{meta.emoji}</span>
          <div>
            <p className="text-sm font-bold">
              {alert.type} — {alert.location}
              {isShaky && <span className="mr-2 rounded-full bg-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-800">⚠️ مش متأكدين</span>}
            </p>
            {alert.line_name && <p className="text-xs opacity-80">خط: {alert.line_name}</p>}
            {alert.description && <p className="mt-1 text-xs leading-relaxed">{alert.description}</p>}
          </div>
        </div>
        <div className="shrink-0 text-left">
          <p className="text-[11px] opacity-70">{timeAgo(alert.created_at)}</p>
          <p className="mt-1 text-[11px] font-medium">
            <span className="text-emerald-700">✓ {alert.confirmations_count}</span>
            {alert.disputes_count > 0 && <span className="mr-1 text-rose-700">· ✗ {alert.disputes_count}</span>}
          </p>
          {trustPct !== null && total >= 2 && (
            <p className="text-[10px] opacity-70">ثقة {trustPct}%</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {canConfirm && (
            <Button size="sm" variant="outline" onClick={onConfirm} disabled={busy !== null} className="gap-1 bg-white">
              {busy === "confirm" ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              أكّد
            </Button>
          )}
          {canDispute && (
            <Button size="sm" variant="outline" onClick={onDispute} disabled={busy !== null} className="gap-1 bg-white text-rose-700 hover:bg-rose-50">
              {busy === "dispute" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsDown className="h-3 w-3" />}
              مش صحيح
            </Button>
          )}
          {hasConfirmed && (
            <span className="inline-flex items-center gap-1 text-xs font-medium opacity-80">
              <CheckCircle2 className="h-3 w-3" /> أكّدت
            </span>
          )}
          {hasDisputed && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 opacity-80">
              <ThumbsDown className="h-3 w-3" /> رفضت
            </span>
          )}
          {isOwner && <span className="text-xs opacity-70">بلاغك ✓</span>}
          <Button
            size="sm"
            variant="ghost"
            className="gap-1 text-xs"
            onClick={() => shareStoryCard({
              template: "alert",
              title: alert.type,
              subtitle: alert.location,
              emoji: "🚨",
              meta: [
                alert.line_name ? `خط: ${alert.line_name}` : "بلاغ مباشر",
                `✓ ${alert.confirmations_count} أكدوا • ${timeAgo(alert.created_at)}`,
              ],
              cta: "wsel.app — بلاغات مباشرة",
            })}
          >
            <ImageIcon className="h-3 w-3" /> ستوري
          </Button>
        </div>

        {alert.lat && alert.lng && (
          <a
            href={`https://www.openstreetmap.org/?mlat=${alert.lat}&mlon=${alert.lng}#map=16/${alert.lat}/${alert.lng}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs underline opacity-90"
          >
            <MapPin className="h-3 w-3" /> الموقع
          </a>
        )}
      </div>
      {err && <p className="mt-2 text-xs text-rose-700">{err}</p>}
    </li>
  );
}

function AlertForm({ defaultLine, onDone }: { defaultLine?: string; onDone: () => void }) {
  const [type, setType] = useState<AlertType>("زحمة");
  const [location, setLocation] = useState("");
  const [line, setLine] = useState(defaultLine ?? "");
  const [desc, setDesc] = useState("");
  const [useGps, setUseGps] = useState(true);
  const [mentions, setMentions] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notified, setNotified] = useState<number | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location.trim()) { setErr("اكتب المكان"); return; }
    setBusy(true); setErr(null); setNotified(null);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      if (useGps && "geolocation" in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000 })
          );
          lat = pos.coords.latitude; lng = pos.coords.longitude;
        } catch { /* ignore */ }
      }
      const mention_codes = mentions
        .split(/[,،\s]+/)
        .map((c) => c.trim())
        .filter(Boolean);

      await createAlert({
        type, location,
        line_name: line || undefined,
        description: desc || undefined,
        lat, lng,
        mention_codes: mention_codes.length ? mention_codes : undefined,
      });
      setNotified(mention_codes.length);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطأ");
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {ALERT_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              type === t ? ALERT_META[t].color + " ring-2 ring-offset-1 ring-rose-400" : "bg-slate-50 text-slate-700"
            }`}
          >
            {ALERT_META[t].emoji} {t}
          </button>
        ))}
      </div>
      <input
        required
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="المكان (مثال: ميدان لبنان)"
        className="w-full rounded-lg border px-3 py-2 text-sm"
      />
      <input
        value={line}
        onChange={(e) => setLine(e.target.value)}
        placeholder="الخط أو المواصلة (مهم عشان يوصل لناس على نفس الطريق)"
        className="w-full rounded-lg border px-3 py-2 text-sm"
      />
      <textarea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="تفاصيل (اختياري)"
        rows={2}
        className="w-full rounded-lg border px-3 py-2 text-sm"
      />
      <div className="space-y-1">
        <label className="flex items-center gap-1 text-xs font-medium text-slate-700">
          <UserPlus className="h-3 w-3" /> نبّه صحابك (أكواد دعوة مفصولة بفاصلة)
        </label>
        <input
          value={mentions}
          onChange={(e) => setMentions(e.target.value)}
          placeholder="مثال: AB12CD, EF34GH"
          className="w-full rounded-lg border px-3 py-2 text-sm uppercase"
        />
        <p className="text-[11px] text-slate-500">هيوصلهم إشعار حتى لو مش على نفس الطريق.</p>
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={useGps} onChange={(e) => setUseGps(e.target.checked)} />
        ارفق موقعي الحالي
      </label>
      {err && <p className="text-xs text-rose-600">{err}</p>}
      {notified !== null && notified > 0 && (
        <p className="text-xs text-emerald-700">✅ تم تنبيه {notified} صاحب.</p>
      )}
      <Button type="submit" disabled={busy} className="w-full gap-2 bg-rose-500 hover:bg-rose-600">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
        ابعت البلاغ (+3 نقاط)
      </Button>
    </form>
  );
}


export default Route.component;
