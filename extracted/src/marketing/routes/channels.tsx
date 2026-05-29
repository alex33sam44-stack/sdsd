import { createFileRoute, Link } from "@/marketing/routerCompat";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2, MessageSquare, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createChannel, listChannels, type LineChannel } from "@/marketing/lib/channels";
import { useAuth } from "@/marketing/hooks/useAuth";

export const Route = createFileRoute("/channels")({
  component: ChannelsPage,
  head: () => ({
    meta: [
      { title: "قنوات الخطوط — شات الراكبين" },
      { name: "description", content: "شات حي لكل خط مترو أو طريق — اسأل اللي قبلك" },
    ],
  }),
});

function ChannelsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<LineChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ slug: "", name: "", description: "" });
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await listChannels());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true); setErr(null);
    try {
      const slug = form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
      await createChannel({ slug, name: form.name.trim(), description: form.description.trim() || undefined });
      setShowNew(false);
      setForm({ slug: "", name: "", description: "" });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطأ");
    } finally { setCreating(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white" dir="rtl">
      <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-sm text-slate-600">
            <ArrowRight className="h-4 w-4" /> الرئيسية
          </Link>
          <h1 className="text-base font-bold text-slate-900">قنوات الخطوط 💬</h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <p className="font-bold">شات لايف لكل خط ✨</p>
          <p className="mt-1 text-xs">ادخل قناة خطك (مترو، ميكروباص، طريق) واسأل اللي راكب دلوقتي — رد سريع وحقيقي.</p>
        </div>

        {user && (
          <div>
            {!showNew ? (
              <Button onClick={() => setShowNew(true)} variant="outline" className="w-full gap-2">
                <Plus className="h-4 w-4" /> اعمل قناة جديدة
              </Button>
            ) : (
              <form onSubmit={onCreate} className="space-y-2 rounded-2xl border bg-white p-4 shadow-sm">
                <input required minLength={3} maxLength={50} placeholder="معرّف القناة (بالإنجليزي مثال: nasr-tahrir)"
                  value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm" />
                <input required minLength={3} maxLength={80} placeholder="اسم القناة (مثال: مدينة نصر ↔ التحرير)"
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm" />
                <input maxLength={200} placeholder="وصف اختياري"
                  value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm" />
                {err && <p className="text-xs text-rose-600">{err}</p>}
                <div className="flex gap-2">
                  <Button type="submit" disabled={creating} className="flex-1 bg-sky-600 hover:bg-sky-700">
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "إنشاء"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowNew(false)}>إلغاء</Button>
                </div>
              </form>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-sky-600" /></div>
        ) : items.length === 0 ? (
          <p className="text-center text-sm text-slate-500 py-12">مفيش قنوات لسه</p>
        ) : (
          <ul className="space-y-2">
            {items.map((c) => (
              <li key={c.id}>
                <Link
                  to="/c/$slug"
                  params={{ slug: c.slug }}
                  className="flex items-center justify-between rounded-2xl border bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow-md"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100">
                      <MessageSquare className="h-5 w-5 text-sky-600" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{c.name}</p>
                      {c.description && <p className="text-xs text-slate-500">{c.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <Users className="h-3 w-3" /> {c.members_count}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}


export default Route.component;
