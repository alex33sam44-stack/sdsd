import { createFileRoute, Link } from "@/marketing/routerCompat";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Coins, MessageCircle, Check, Send, Loader2, Plus, Trophy, Search, Bell, Map as MapIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/marketing/hooks/useAuth";
import {
  acceptAnswer,
  askQuestion,
  badgeForPoints,
  fetchAnswers,
  fetchMyProfile,
  fetchNotifications,
  fetchProfilesByIds,
  fetchQuestions,
  markAllNotificationsRead,
  postAnswer,
  type Answer,
  type Notification,
  type Profile,
  type Question,
  type QuestionFilter,
} from "@/marketing/lib/chat";
import { dataClient } from "@/marketing/integrations/data/client";

function gmapsUrl(from?: string | null, to?: string | null) {
  const query = [from, to].filter(Boolean).join(" إلى ");
  return `/planner?from=${encodeURIComponent(from || "")}&to=${encodeURIComponent(to || query || "")}&src=community-mapless`;
}

export const Route = createFileRoute("/chat")({
  component: ChatPage,
  head: () => ({
    meta: [
      { title: "اسأل المجتمع — مواصلات" },
      { name: "description", content: "اسأل عن خط مواصلات، وحد يرد ياخد نقاط" },
    ],
  }),
});

function ChatPage() {
  const { user, loading } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAsk, setShowAsk] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<QuestionFilter>("all");
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);

  const refresh = useCallback(async () => {
    setLoadingList(true);
    try {
      const qs = await fetchQuestions({ search, filter });
      setQuestions(qs);
      const ids = Array.from(new Set(qs.map((q) => q.user_id)));
      setProfiles(await fetchProfilesByIds(ids));
      if (user) setMyProfile(await fetchMyProfile());
    } finally {
      setLoadingList(false);
    }
  }, [user, search, filter]);

  const refreshNotifs = useCallback(async () => {
    if (!user) {
      setNotifs([]);
      return;
    }
    try {
      setNotifs(await fetchNotifications());
    } catch {
      // ignore
    }
  }, [user]);

  useEffect(() => {
    refresh();
    const channel = dataClient
      .channel("chat-questions")
      .on("postgres_changes", { event: "*", schema: "public", table: "questions" }, () => refresh())
      .subscribe();
    return () => {
      dataClient.removeChannel(channel);
    };
  }, [refresh]);

  useEffect(() => {
    refreshNotifs();
    if (!user) return;
    const ch = dataClient
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => refreshNotifs(),
      )
      .subscribe();
    return () => {
      dataClient.removeChannel(ch);
    };
  }, [user, refreshNotifs]);

  const unreadCount = useMemo(() => notifs.filter((n) => !n.read).length, [notifs]);

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowRight className="h-4 w-4" />
            رجوع للخريطة
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/leaderboard" className="inline-flex items-center gap-1 rounded-full border bg-card px-3 py-1 text-sm text-muted-foreground hover:text-foreground">
              <Trophy className="h-4 w-4 text-amber-500" />
              المتصدرون
            </Link>
            {user && (
              <button
                onClick={async () => {
                  setShowNotifs((s) => !s);
                  if (unreadCount > 0) {
                    await markAllNotificationsRead();
                    await refreshNotifs();
                  }
                }}
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border bg-card hover:bg-muted"
                aria-label="إشعارات"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -left-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
            )}
            {myProfile && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1 text-sm font-medium text-amber-700 dark:text-amber-300">
                <Coins className="h-4 w-4" />
                {myProfile.points}
              </span>
            )}
            {!loading && !user && (
              <Link to="/login">
                <Button size="sm">سجّل دخول</Button>
              </Link>
            )}
          </div>
        </div>

        {showNotifs && user && (
          <div className="mx-auto max-w-3xl px-4 pb-3">
            <div className="rounded-lg border bg-card p-2 shadow-sm">
              <div className="flex items-center justify-between border-b px-2 pb-2">
                <span className="text-sm font-semibold">الإشعارات</span>
                <button onClick={() => setShowNotifs(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {notifs.length === 0 ? (
                <p className="px-2 py-4 text-center text-sm text-muted-foreground">مفيش إشعارات.</p>
              ) : (
                <ul className="max-h-72 overflow-y-auto">
                  {notifs.map((n) => (
                    <li
                      key={n.id}
                      onClick={() => {
                        if (n.question_id) {
                          setOpenId(n.question_id);
                          setShowNotifs(false);
                        }
                      }}
                      className={`cursor-pointer rounded-md px-2 py-2 text-sm hover:bg-muted ${!n.read ? "bg-primary/5" : ""}`}
                    >
                      <p className="text-foreground">{n.message}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {new Date(n.created_at).toLocaleString("ar-EG")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">اسأل المجتمع</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            اسأل عن طريقك، وأي حد يعرف يرد عليه ياخد النقاط اللي رصدتها. الجدد بياخدوا 50 نقطة هدية.
          </p>
        </div>

        {user ? (
          <div className="mb-4">
            <Button onClick={() => setShowAsk((s) => !s)} className="gap-2">
              <Plus className="h-4 w-4" />
              {showAsk ? "إخفاء" : "اسأل سؤال جديد"}
            </Button>
          </div>
        ) : (
          <div className="mb-4 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            تقدر تشوف الأسئلة، لكن لازم تسجّل دخول عشان تسأل أو ترد.
          </div>
        )}

        {showAsk && user && (
          <AskForm
            maxPoints={myProfile?.points ?? 0}
            onDone={async () => {
              setShowAsk(false);
              await refresh();
            }}
          />
        )}

        {/* Search + filter */}
        <div className="mb-4 space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث في الأسئلة (مكان، خط، كلمة...)"
              className="w-full rounded-md border bg-background px-3 py-2 pr-9 text-sm"
            />
          </div>
          <div className="flex gap-2">
            {(
              [
                { v: "all", label: "الكل" },
                { v: "open", label: "مفتوح" },
                { v: "answered", label: "متجاوب" },
              ] as const
            ).map((t) => (
              <button
                key={t.v}
                onClick={() => setFilter(t.v)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  filter === t.v
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {loadingList ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : questions.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-muted-foreground">
            مفيش نتائج. {search || filter !== "all" ? "جرب تغيّر البحث أو الفلتر." : "كن أول واحد يسأل!"}
          </div>
        ) : (
          <ul className="space-y-3">
            {questions.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                asker={profiles[q.user_id]}
                currentUserId={user?.id ?? null}
                isOpen={openId === q.id}
                onToggle={() => setOpenId((id) => (id === q.id ? null : q.id))}
                onChanged={refresh}
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function AskForm({ maxPoints, onDone }: { maxPoints: number; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [points, setPoints] = useState(5);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        if (title.trim().length < 3) {
          setErr("اكتب عنوان واضح للسؤال");
          return;
        }
        if (points > maxPoints) {
          setErr(`نقاطك مش كفاية. عندك ${maxPoints} بس.`);
          return;
        }
        setBusy(true);
        try {
          await askQuestion({
            title,
            body,
            from_location: from,
            to_location: to,
            points_offered: points,
          });
          onDone();
        } catch (e: unknown) {
          setErr(e instanceof Error ? e.message : "حصلت مشكلة");
        } finally {
          setBusy(false);
        }
      }}
      className="mb-6 space-y-3 rounded-lg border bg-card p-4"
    >
      <input
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        placeholder="عنوان السؤال (مثلاً: ازاي أروح من رمسيس للعتبة؟)"
        maxLength={200}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="من فين"
          maxLength={200}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="لفين"
          maxLength={200}
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      <textarea
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        placeholder="تفاصيل إضافية (اختياري)"
        maxLength={2000}
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex items-center gap-2 text-sm">
        <Coins className="h-4 w-4 text-amber-500" />
        <label>نقاط المكافأة:</label>
        <input
          type="number"
          min={1}
          max={Math.min(100, Math.max(1, maxPoints))}
          className="w-20 rounded-md border bg-background px-2 py-1"
          value={points}
          onChange={(e) => setPoints(Math.max(1, Number(e.target.value) || 1))}
        />
        <span className="text-muted-foreground">/ عندك {maxPoints}</span>
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Button type="submit" disabled={busy} className="gap-2">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        انشر السؤال
      </Button>
    </form>
  );
}

function QuestionCard({
  question,
  asker,
  currentUserId,
  isOpen,
  onToggle,
  onChanged,
}: {
  question: Question;
  asker?: Profile;
  currentUserId: string | null;
  isOpen: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [answerProfiles, setAnswerProfiles] = useState<Record<string, Profile>>({});
  const [loadingA, setLoadingA] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadAnswers = useCallback(async () => {
    setLoadingA(true);
    try {
      const a = await fetchAnswers(question.id);
      setAnswers(a);
      const ids = Array.from(new Set(a.map((x) => x.user_id)));
      setAnswerProfiles(await fetchProfilesByIds(ids));
    } finally {
      setLoadingA(false);
    }
  }, [question.id]);

  useEffect(() => {
    if (isOpen) loadAnswers();
  }, [isOpen, loadAnswers]);

  const isOwner = currentUserId === question.user_id;
  const hasBest = !!question.best_answer_id;

  return (
    <li className="rounded-lg border bg-card">
      <div
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        className="flex w-full cursor-pointer flex-col gap-2 p-4 text-right hover:bg-muted/40"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-foreground">{question.title}</h3>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
            <Coins className="h-3 w-3" />
            {question.points_offered}
          </span>
        </div>
        {(question.from_location || question.to_location) && (
          <div className="flex w-full items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {question.from_location || "—"} <span className="mx-1">←</span> {question.to_location || "—"}
            </p>
            <a
              href={gmapsUrl(question.from_location, question.to_location)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted"
            >
              <MapIcon className="h-3 w-3" />
              افتح على الخريطة
            </a>
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            بواسطة {asker?.display_name ?? "مستخدم"}
            {asker && (() => {
              const b = badgeForPoints(asker.points);
              return (
                <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${b.className}`}>
                  {b.label}
                </span>
              );
            })()}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="h-3 w-3" />
            {hasBest ? "تم الرد ✓" : "مفتوح"}
          </span>
        </div>
      </div>



      {isOpen && (
        <div className="border-t p-4">
          {question.body && <p className="mb-3 whitespace-pre-wrap text-sm text-foreground">{question.body}</p>}

          {loadingA ? (
            <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
          ) : answers.length === 0 ? (
            <p className="text-sm text-muted-foreground">لسه مفيش ردود. كن أول واحد يساعد!</p>
          ) : (
            <ul className="space-y-2">
              {answers.map((a) => (
                <li
                  key={a.id}
                  className={`rounded-md border p-3 text-sm ${
                    a.is_best ? "border-emerald-500/40 bg-emerald-500/5" : "bg-background"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      {answerProfiles[a.user_id]?.display_name ?? "مستخدم"}
                      {a.is_best && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                          <Trophy className="h-3 w-3" /> أفضل إجابة
                        </span>
                      )}
                    </span>
                    {isOwner && !hasBest && (
                      <button
                        onClick={async () => {
                          try {
                            await acceptAnswer(a.id);
                            await loadAnswers();
                            onChanged();
                          } catch (e: unknown) {
                            alert(e instanceof Error ? e.message : "حصلت مشكلة");
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        <Check className="h-3 w-3" /> اقبل وامنح النقاط
                      </button>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-foreground">{a.body}</p>
                </li>
              ))}
            </ul>
          )}

          {currentUserId && !isOwner && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (text.trim().length === 0) return;
                setBusy(true);
                setErr(null);
                try {
                  await postAnswer(question.id, text);
                  setText("");
                  await loadAnswers();
                } catch (e: unknown) {
                  setErr(e instanceof Error ? e.message : "حصلت مشكلة");
                } finally {
                  setBusy(false);
                }
              }}
              className="mt-3 flex gap-2"
            >
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="اكتب ردك… يركب إيه وينزل فين"
                maxLength={2000}
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
              />
              <Button type="submit" disabled={busy} size="sm">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          )}
          {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
          {isOwner && (
            <p className="mt-3 text-xs text-muted-foreground">ده سؤالك — مش تقدر ترد عليه، بس تقدر تقبل أفضل إجابة.</p>
          )}
          {!currentUserId && (
            <p className="mt-3 text-xs text-muted-foreground">
              <Link to="/login" className="underline">
                سجّل دخول
              </Link>{" "}
              عشان تقدر ترد.
            </p>
          )}
        </div>
      )}
    </li>
  );
}


export default Route.component;
