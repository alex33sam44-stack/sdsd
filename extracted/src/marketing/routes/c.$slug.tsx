import { createFileRoute, Link, useParams } from "@/marketing/routerCompat";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fetchMessages,
  getChannelBySlug,
  joinChannel,
  sendMessage,
  subscribeChannel,
  type ChannelMessage,
  type LineChannel,
} from "@/marketing/lib/channels";
import { useAuth } from "@/marketing/hooks/useAuth";
import { buildOgImageUrl, setShareMeta } from "@/marketing/lib/openGraph";

export const Route = createFileRoute("/c/$slug")({
  component: ChannelPage,
  head: () => ({
    meta: [
      { title: "شات لايف — قناة الخط" },
      { name: "description", content: "اتكلم مع الراكبين على نفس الخط دلوقتي" },
    ],
  }),
});

function ChannelPage() {
  const { slug } = useParams({ from: "/c/$slug" });
  const { user } = useAuth();
  const [channel, setChannel] = useState<LineChannel | null>(null);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    (async () => {
      try {
        const c = await getChannelBySlug(slug);
        if (!c) { setErr("القناة مش موجودة"); setLoading(false); return; }
        setChannel(c);
        const msgs = await fetchMessages(c.id);
        setMessages(msgs);
        if (user) { try { await joinChannel(c.id); } catch {} }
        cleanup = subscribeChannel(c.id, (m) => {
          setMessages((prev) => prev.some((p) => p.id === m.id) ? prev : [...prev, m]);
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : "خطأ");
      } finally {
        setLoading(false);
      }
    })();
    return () => { cleanup?.(); };
  }, [slug, user]);

  useEffect(() => {
    if (!channel) return;
    setShareMeta({
      title: `${channel.name} — شات الطريق لايف`,
      description: channel.description ?? `${channel.members_count} عضو بيتابعوا الزحمة والمواعيد على نفس الخط.`,
      image: buildOgImageUrl("c", slug),
      url: window.location.href,
    });
  }, [channel, slug]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const onSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !channel) return;
    setSending(true);
    try {
      await sendMessage(channel.id, text);
      setText("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطأ");
    } finally { setSending(false); }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-sky-600" /></div>;
  if (err && !channel) return <div className="p-6 text-center text-rose-600" dir="rtl">{err}</div>;

  return (
    <div className="flex h-screen flex-col bg-gradient-to-b from-sky-50 to-white" dir="rtl">
      <header className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/channels" className="flex items-center gap-2 text-sm text-slate-600">
            <ArrowRight className="h-4 w-4" />
          </Link>
          <div className="text-center">
            <h1 className="text-sm font-bold text-slate-900">{channel?.name}</h1>
            <p className="flex items-center justify-center gap-1 text-[11px] text-slate-500">
              <Users className="h-3 w-3" /> {channel?.members_count} عضو
            </p>
          </div>
          <div className="w-8" />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4 py-3">
        <div className="flex-1 space-y-2 overflow-y-auto pb-4">
          {messages.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-10">ابدأ المحادثة — اسأل عن الزحمة أو المواعيد 💬</p>
          ) : (
            messages.map((m) => {
              const mine = m.user_id === user?.id;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${mine ? "bg-sky-500 text-white" : "bg-white text-slate-900 border"}`}>
                    {!mine && <p className="text-[10px] font-bold text-sky-600">{m.display_name ?? "صديق"}</p>}
                    <p className="break-words">{m.body}</p>
                    <p className={`mt-1 text-[10px] ${mine ? "text-sky-100" : "text-slate-400"}`}>
                      {new Date(m.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {user ? (
          <form onSubmit={onSend} className="flex gap-2 border-t bg-white px-3 py-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="اكتب رسالة…"
              maxLength={500}
              className="flex-1 rounded-full border px-4 py-2 text-sm outline-none focus:border-sky-500"
            />
            <Button type="submit" size="sm" disabled={sending || !text.trim()} className="rounded-full bg-sky-600 hover:bg-sky-700">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        ) : (
          <div className="border-t bg-white p-4 text-center">
            <Link to="/login"><Button size="sm" className="bg-sky-600 hover:bg-sky-700">سجل دخول للمشاركة</Button></Link>
          </div>
        )}
      </main>
    </div>
  );
}


export default Route.component;
