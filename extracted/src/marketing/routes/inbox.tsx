import { createFileRoute, Link } from "@/marketing/routerCompat";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2, Mic, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { answerLiveQuestion, fetchMyInbox, type LiveQuestion } from "@/marketing/lib/liveQuestions";
import { useAuth } from "@/marketing/hooks/useAuth";

export const Route = createFileRoute("/inbox")({
  component: InboxPage,
  head: () => ({
    meta: [{ title: "أسئلة موجهة ليك 🎙️" }],
  }),
});

function InboxPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<LiveQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setItems(await fetchMyInbox()); } finally { setLoading(false); }
  };
  useEffect(() => { if (user) void load(); else setLoading(false); }, [user]);

  const onAnswer = async (id: string) => {
    const ans = (drafts[id] ?? "").trim();
    if (!ans) return;
    setSavingId(id);
    try {
      await answerLiveQuestion(id, ans);
      setDrafts((d) => ({ ...d, [id]: "" }));
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "خطأ");
    } finally { setSavingId(null); }
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center" dir="rtl">
        <div>
          <p className="mb-4 text-slate-600">سجل دخول علشان تشوف الأسئلة</p>
          <Link to="/login"><Button>دخول</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50 to-white" dir="rtl">
      <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-sm text-slate-600">
            <ArrowRight className="h-4 w-4" /> الرئيسية
          </Link>
          <h1 className="text-base font-bold text-slate-900">أسئلة ليك 🎙️</h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-3">
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-xs text-violet-900">
          🎁 لما ترد على سؤال، بتاخد <b>5 نقاط</b> — مساعدتك للناس بتزود نقاطك.
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-violet-600" /></div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">
            <Mic className="mx-auto mb-2 h-8 w-8 text-violet-400" />
            مفيش أسئلة لسه. لما تشغل رحلة وتشيرها، الناس تقدر تسألك.
          </div>
        ) : (
          items.map((q) => (
            <div key={q.id} className="rounded-2xl border bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-800">❓ {q.body}</p>
              <p className="mt-1 text-[11px] text-slate-400">
                {new Date(q.created_at).toLocaleString("ar-EG")}
              </p>
              {q.answered_at ? (
                <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-900">✅ ردك: {q.answer}</p>
              ) : (
                <div className="mt-3 flex gap-2">
                  <input
                    value={drafts[q.id] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                    placeholder="اكتب ردك السريع…"
                    maxLength={280}
                    className="flex-1 rounded-lg border px-3 py-2 text-sm"
                  />
                  <Button size="sm" disabled={savingId === q.id} onClick={() => onAnswer(q.id)} className="bg-violet-600 hover:bg-violet-700">
                    {savingId === q.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </main>
    </div>
  );
}


export default Route.component;
