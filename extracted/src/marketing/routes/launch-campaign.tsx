import { useMemo } from "react";
import { Link } from "@/marketing/routerCompat";
import { ArrowLeft, Bus, Clock3, Coins, Flame, MapPin, MessageCircle, Share2, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  LAUNCH_CAMPAIGNS,
  campaignPlannerUrl,
  campaignWhatsappUrl,
  getCampaignByPath,
  type LaunchCampaign,
} from "@/marketing/lib/launchCampaigns";

function fallbackCampaign(): LaunchCampaign {
  return LAUNCH_CAMPAIGNS[0];
}

export default function LaunchCampaignPage() {
  const campaign = useMemo(() => getCampaignByPath(window.location.pathname) ?? fallbackCampaign(), []);
  const pageUrl = `${window.location.origin}${campaign.path}`;
  const plannerUrl = campaignPlannerUrl(campaign);
  const whatsappUrl = campaignWhatsappUrl(campaign, pageUrl);

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-sky-950 to-white">
      <header className="border-b border-white/10 bg-slate-950/80 text-white backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/marketing" className="flex items-center gap-2">
            <span className="rounded-2xl bg-sky-500 p-2"><Bus className="h-5 w-5" /></span>
            <span className="text-xl font-black">مواصلات</span>
          </Link>
          <div className="flex items-center gap-2">
            <a href={whatsappUrl} target="_blank" rel="noreferrer">
              <Button size="sm" className="gap-2 bg-emerald-500 text-white hover:bg-emerald-600">
                <MessageCircle className="h-4 w-4" /> ابعت للجروب
              </Button>
            </a>
            <Link to="/marketing">
              <Button size="sm" variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20">
                الرئيسية
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="space-y-5 text-white">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1 text-xs font-black text-amber-200">
              <MapPin className="h-3.5 w-3.5" /> حملة إطلاق موجهة · {campaign.name}
            </div>
            <h1 className="max-w-3xl text-4xl font-black leading-tight tracking-tight md:text-6xl">
              {campaign.headline}
            </h1>
            <p className="max-w-2xl text-lg leading-9 text-slate-300">{campaign.subheadline}</p>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                <Clock3 className="h-5 w-5 text-amber-300" />
                <p className="mt-2 text-3xl font-black">{campaign.heroMinutes} د</p>
                <p className="text-sm text-slate-300">وقت تقريبي</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                <Coins className="h-5 w-5 text-amber-300" />
                <p className="mt-2 text-3xl font-black">{campaign.heroFare} ج</p>
                <p className="text-sm text-slate-300">تكلفة متوقعة</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                <Flame className="h-5 w-5 text-rose-300" />
                <p className="mt-2 text-3xl font-black">{campaign.traffic}</p>
                <p className="text-sm text-slate-300">زحمة المجتمع</p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <a href={plannerUrl}>
                <Button size="lg" className="w-full gap-2 bg-amber-400 text-slate-950 hover:bg-amber-300 sm:w-auto">
                  احسب طريقي الآن <ArrowLeft className="h-4 w-4" />
                </Button>
              </a>
              <a href={whatsappUrl} target="_blank" rel="noreferrer">
                <Button size="lg" variant="outline" className="w-full gap-2 border-emerald-300 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20 sm:w-auto">
                  <Share2 className="h-4 w-4" /> {campaign.whatsappGroupLine}
                </Button>
              </a>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white p-5 shadow-2xl">
            <p className="text-sm font-black text-sky-700">نتيجة تجريبية فورية</p>
            <h2 className="mt-1 text-3xl font-black text-slate-950">
              {campaign.primaryFrom} ← {campaign.primaryTo}
            </h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">{campaign.pain}</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-3xl bg-sky-50 p-4 text-sky-950">
                <p className="text-xs font-black">الوقت</p>
                <p className="text-3xl font-black">{campaign.heroMinutes} دقيقة</p>
              </div>
              <div className="rounded-3xl bg-emerald-50 p-4 text-emerald-950">
                <p className="text-xs font-black">التكلفة</p>
                <p className="text-3xl font-black">{campaign.heroFare} جنيه</p>
              </div>
              <div className="rounded-3xl bg-violet-50 p-4 text-violet-950">
                <p className="text-xs font-black">التبديلات</p>
                <p className="text-3xl font-black">{campaign.heroTransfers}</p>
              </div>
              <div className="rounded-3xl bg-rose-50 p-4 text-rose-950">
                <p className="text-xs font-black">الزحمة</p>
                <p className="text-3xl font-black">{campaign.traffic}</p>
              </div>
            </div>
            <div className="mt-4 rounded-3xl bg-slate-950 p-4 text-white">
              <p className="text-xs font-black text-amber-300">{campaign.socialProof}</p>
              <p className="mt-2 leading-7 text-slate-300">{campaign.promise}</p>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[2rem] border bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              <h2 className="text-2xl font-black text-slate-950">{campaign.challengeTitle}</h2>
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-600">{campaign.challengeReward}</p>
            <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm font-bold leading-7 text-amber-900">{campaign.dailyMoment}</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              {campaign.areaSlug ? (
                <Link to={`/areas/${campaign.areaSlug}`}>
                  <Button className="w-full gap-2 bg-sky-600 hover:bg-sky-700 sm:w-auto">
                    <Users className="h-4 w-4" /> انضم لمجتمع المنطقة
                  </Button>
                </Link>
              ) : null}
              <Link to="/daily">
                <Button variant="outline" className="w-full sm:w-auto">فعّل خطي اليومي</Button>
              </Link>
            </div>
          </div>

          <div className="rounded-[2rem] border bg-white p-5 shadow-sm">
            <h2 className="text-2xl font-black text-slate-950">أكثر routes مطلوبة لهذه الحملة</h2>
            <div className="mt-4 space-y-3">
              {campaign.hotRoutes.map((route) => (
                <a
                  key={`${route.from}-${route.to}`}
                  href={campaignPlannerUrl(campaign, route.from, route.to)}
                  className="block rounded-3xl border bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:bg-sky-50 hover:shadow-md"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-lg font-black text-slate-950">{route.from} ← {route.to}</p>
                      <p className="text-sm text-slate-600">{route.minutes} دقيقة · {route.fare} جنيه · ضغط {route.pressure}</p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-sky-700">احسب الطريق</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
