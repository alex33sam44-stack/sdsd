import { createFileRoute, Link, useParams } from "@/marketing/routerCompat";
import { useMemo } from "react";
import { ArrowRight, Award, Bell, Flame, MapPin, MessageCircle, Route as RouteIcon, Share2, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AREA_PAGES, areaWhatsappUrl, getAreaBySlug } from "@/marketing/lib/areas";
import { UGCContributionPanel } from "@/marketing/components/UGCContributionPanel";
import { TrustLayerPanel } from "@/marketing/components/TrustLayerPanel";

export const Route = createFileRoute("/areas/$slug")({
  component: AreaPage,
  head: () => ({
    meta: [
      { title: "تحديات المناطق — مواصلات" },
      { name: "description", content: "صفحات محلية لكل منطقة: أكثر routes بحثًا، البلاغات، أفضل المساهمين، وتحديات أسبوعية." },
    ],
  }),
});

const pressureClass = {
  خفيف: "bg-emerald-50 text-emerald-700 border-emerald-200",
  متوسط: "bg-amber-50 text-amber-800 border-amber-200",
  عالي: "bg-rose-50 text-rose-700 border-rose-200",
} as const;

const severityClass = {
  low: "bg-sky-50 text-sky-700 border-sky-200",
  medium: "bg-amber-50 text-amber-800 border-amber-200",
  high: "bg-rose-50 text-rose-700 border-rose-200",
} as const;

function AreaPage() {
  const { slug } = useParams();
  const area = getAreaBySlug(slug);
  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return `/areas/${slug ?? "faisal"}`;
    return `${window.location.origin}/areas/${slug ?? "faisal"}?src=whatsapp`;
  }, [slug]);

  if (!area) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50">
        <main className="mx-auto max-w-3xl px-4 py-10">
          <Link to="/marketing" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowRight className="h-4 w-4" /> رجوع
          </Link>
          <div className="mt-6 rounded-3xl border bg-white p-8 text-center shadow-sm">
            <h1 className="text-2xl font-black text-slate-950">المنطقة دي مش موجودة لسه</h1>
            <p className="mt-2 text-sm text-slate-600">اختار واحدة من المناطق النشطة وابدأ التحدي المحلي.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {AREA_PAGES.map((item) => (
                <Link key={item.slug} to={`/areas/${item.slug}`}>
                  <Button variant="outline">{item.name}</Button>
                </Link>
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-sky-50">
      <header className="border-b bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/marketing" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowRight className="h-4 w-4" /> رجوع للتسويق
          </Link>
          <h1 className="inline-flex items-center gap-2 text-lg font-black text-slate-950">
            <MapPin className="h-5 w-5 text-amber-500" /> {area.name}
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        <section className="overflow-hidden rounded-[2rem] border bg-slate-950 text-white shadow-xl">
          <div className="grid gap-5 p-5 md:grid-cols-[1.1fr_0.9fr] md:p-8">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1 text-xs font-black text-amber-200">
                <Flame className="h-3.5 w-3.5" /> تحدي محلي هذا الأسبوع
              </div>
              <div>
                <h2 className="text-4xl font-black leading-tight md:text-6xl">{area.headline}</h2>
                <p className="mt-3 max-w-xl text-base leading-8 text-slate-300">
                  الانتشار الحقيقي يبدأ من المنطقة: ساعد أهل {area.name} يعرفوا الزحمة، البدائل، والمحطات الصح — وخلي اسمك يظهر وسط مساعدين المنطقة.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="rounded-full bg-emerald-400 px-3 py-1 font-black text-emerald-950">{area.weeklySearches.toLocaleString("ar-EG")} بحث هذا الأسبوع</span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-slate-200">{area.activeReports} بلاغ نشط</span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-slate-200">{area.memberCount.toLocaleString("ar-EG")} عضو مجتمع</span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <a href={areaWhatsappUrl(area, shareUrl)} target="_blank" rel="noreferrer">
                  <Button size="lg" className="w-full gap-2 bg-emerald-500 font-black text-white hover:bg-emerald-600 sm:w-auto">
                    <MessageCircle className="h-4 w-4" /> انضم لمجتمع المنطقة
                  </Button>
                </a>
                <Link to={`/chat?area=${encodeURIComponent(area.name)}`}>
                  <Button size="lg" variant="outline" className="w-full gap-2 border-white/20 bg-white/10 text-white hover:bg-white/20 sm:w-auto">
                    <Users className="h-4 w-4" /> اسأل أهل {area.name}
                  </Button>
                </Link>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-white p-4 text-slate-950 shadow-2xl">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                  <Trophy className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-500">تحدي الأسبوع</p>
                  <h3 className="text-2xl font-black">{area.challenge.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-600">{area.challenge.description}</p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl bg-slate-100 p-3">
                <div className="flex items-center justify-between text-xs font-black text-slate-600">
                  <span>{area.challenge.goal}</span>
                  <span>{area.challenge.progress}%</span>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${area.challenge.progress}%` }} />
                </div>
              </div>
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
                المكافأة: {area.challenge.reward}
              </div>
            </div>
          </div>
        </section>

        <UGCContributionPanel
          context={{ areaName: area.name, routeName: area.topRoute }}
          title={`ساعد أهل ${area.name} بمساهمة حقيقية`}
        />

        <TrustLayerPanel
          context={{ areaName: area.name, routeName: area.topRoute }}
        />

        <section className="grid gap-3 md:grid-cols-3">
          {area.routes.map((route) => (
            <Link key={`${route.from}-${route.to}`} to={`/planner?from=${encodeURIComponent(route.from)}&to=${encodeURIComponent(route.to)}&area=${area.slug}`} className="rounded-3xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-center justify-between gap-2">
                <RouteIcon className="h-5 w-5 text-sky-600" />
                <span className={`rounded-full border px-2 py-0.5 text-xs font-black ${pressureClass[route.pressure]}`}>{route.pressure}</span>
              </div>
              <h3 className="mt-3 text-xl font-black text-slate-950">{route.from} → {route.to}</h3>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-2xl bg-sky-50 p-2"><b className="block text-lg text-slate-950">{route.averageMinutes}</b>دقيقة</div>
                <div className="rounded-2xl bg-amber-50 p-2"><b className="block text-lg text-slate-950">{route.averageFare}</b>جنيه</div>
                <div className="rounded-2xl bg-violet-50 p-2"><b className="block text-lg text-slate-950">{route.searches}</b>بحث</div>
              </div>
            </Link>
          ))}
        </section>

        <section className="grid gap-4 md:grid-cols-[1fr_1fr]">
          <div className="rounded-3xl border bg-white p-5 shadow-sm">
            <h3 className="inline-flex items-center gap-2 text-2xl font-black text-slate-950">
              <Bell className="h-5 w-5 text-rose-500" /> بلاغات {area.name}
            </h3>
            <div className="mt-4 space-y-2">
              {area.reports.map((report) => (
                <div key={report.id} className={`rounded-2xl border p-3 ${severityClass[report.severity]}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black">{report.title}</p>
                    <span className="text-[11px] font-bold opacity-75">{report.timeAgo}</span>
                  </div>
                  <p className="mt-1 text-sm leading-6 opacity-80">{report.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border bg-white p-5 shadow-sm">
            <h3 className="inline-flex items-center gap-2 text-2xl font-black text-slate-950">
              <Award className="h-5 w-5 text-amber-500" /> أفضل مساعدين المنطقة
            </h3>
            <ol className="mt-4 space-y-2">
              {area.contributors.map((contributor) => (
                <li key={contributor.rank} className="flex items-center gap-3 rounded-2xl border bg-slate-50 p-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-sm font-black text-amber-700">#{contributor.rank}</span>
                  <div className="flex-1">
                    <p className="font-black text-slate-950">{contributor.name}</p>
                    <p className="text-xs font-bold text-slate-500">{contributor.badge} • ساعد {contributor.helped} شخص</p>
                  </div>
                  <span className="text-sm font-black text-amber-600">{contributor.points} نقطة</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-2xl font-black text-slate-950">ادعُ صحابك من {area.name}</h3>
              <p className="mt-1 text-sm leading-7 text-slate-700">كل ما ناس أكتر من نفس المنطقة تدخل، البلاغات تبقى أسرع، والroutes الأكثر بحثًا تبقى أدق.</p>
            </div>
            <a href={areaWhatsappUrl(area, shareUrl)} target="_blank" rel="noreferrer">
              <Button size="lg" className="w-full gap-2 bg-emerald-600 font-black hover:bg-emerald-700 sm:w-auto">
                <Share2 className="h-4 w-4" /> ابعت لجروب {area.name}
              </Button>
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
