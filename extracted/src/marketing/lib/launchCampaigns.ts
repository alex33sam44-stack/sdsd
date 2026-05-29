export type LaunchCampaign = {
  slug: string;
  path: string;
  areaSlug?: string;
  name: string;
  audience: string;
  headline: string;
  subheadline: string;
  pain: string;
  promise: string;
  socialProof: string;
  primaryFrom: string;
  primaryTo: string;
  heroMinutes: number;
  heroFare: number;
  heroTransfers: number;
  traffic: "خفيفة" | "متوسطة" | "عالية";
  hotRoutes: Array<{ from: string; to: string; minutes: number; fare: number; pressure: "متوسط" | "عالي" }>;
  dailyMoment: string;
  whatsappGroupLine: string;
  challengeTitle: string;
  challengeReward: string;
};

export const LAUNCH_CAMPAIGNS: LaunchCampaign[] = [
  {
    slug: "cairo-university",
    path: "/cairo-university",
    areaSlug: "faisal",
    name: "جامعة القاهرة",
    audience: "طلاب جامعة القاهرة واللي رايحين محاضرات أو سكاشن",
    headline: "رايح جامعة القاهرة؟ اعرف تركب إيه قبل ما تنزل.",
    subheadline: "من فيصل، الهرم، رمسيس أو مدينة نصر — شوف الوقت والتكلفة والزحمة وابعته لجروب الدفعة.",
    pain: "المشكلة اليومية: محاضرة بدري، تحويلات كتير، ومش عارف الخط واقف ولا سالك.",
    promise: "مواصلات يديك طريق سريع + تكلفة تقريبية + زحمة المجتمع قبل النزول.",
    socialProof: "+1,240 رحلة طلابية محسوبة هذا الأسبوع",
    primaryFrom: "فيصل",
    primaryTo: "جامعة القاهرة",
    heroMinutes: 28,
    heroFare: 12,
    heroTransfers: 1,
    traffic: "متوسطة",
    hotRoutes: [
      { from: "فيصل", to: "جامعة القاهرة", minutes: 28, fare: 12, pressure: "متوسط" },
      { from: "رمسيس", to: "جامعة القاهرة", minutes: 34, fare: 14, pressure: "عالي" },
      { from: "مدينة نصر", to: "جامعة القاهرة", minutes: 52, fare: 22, pressure: "عالي" },
    ],
    dailyMoment: "كل صباح: طريق الجامعة عليه تأخير؟ شوف البديل قبل المحاضرة.",
    whatsappGroupLine: "ابعت لجروب الدفعة يشوفوا الطريق والزحمة قبل ما ينزلوا.",
    challengeTitle: "تحدي دفعة جامعة القاهرة",
    challengeReward: "أكثر طالب يساعد الدفعة يظهر في leaderboard الجامعة",
  },
  {
    slug: "ramses",
    path: "/ramses",
    areaSlug: "ramses",
    name: "رمسيس",
    audience: "ركاب رمسيس والموظفين اللي بيبدّلوا من هناك",
    headline: "رمسيس زحمة؟ شوف البديل قبل ما تدخل الموقف.",
    subheadline: "اعرف أسرع خط، التكلفة، وآخر بلاغات الناس حوالين رمسيس في لحظة.",
    pain: "رمسيس نقطة تقاطع ضخمة؛ دقيقة غلط ممكن تضيع نص ساعة في الانتظار.",
    promise: "مواصلات يجمع بلاغات الناس وخيارات الطرق علشان تختار قبل ما تتزنق.",
    socialProof: "+2,860 رحلة من/إلى رمسيس محسوبة هذا الأسبوع",
    primaryFrom: "رمسيس",
    primaryTo: "مدينة نصر",
    heroMinutes: 45,
    heroFare: 20,
    heroTransfers: 1,
    traffic: "عالية",
    hotRoutes: [
      { from: "رمسيس", to: "مدينة نصر", minutes: 45, fare: 20, pressure: "عالي" },
      { from: "رمسيس", to: "التجمع", minutes: 62, fare: 28, pressure: "عالي" },
      { from: "رمسيس", to: "العتبة", minutes: 16, fare: 8, pressure: "متوسط" },
    ],
    dailyMoment: "كل يوم: شوف موقف رمسيس واقف ولا فيه بديل أسرع قبل ما توصل.",
    whatsappGroupLine: "ابعت لجروب الشغل: رمسيس واقف ولا سالك؟",
    challengeTitle: "مين أكثر شخص ساعد ركاب رمسيس؟",
    challengeReward: "لقب منقذ رمسيس + أولوية ظهور البلاغات",
  },
  {
    slug: "faisal",
    path: "/faisal",
    areaSlug: "faisal",
    name: "فيصل/الهرم",
    audience: "ركاب فيصل والهرم المتجهين للجامعة، رمسيس، ومدينة نصر",
    headline: "نازل من فيصل؟ اعرف الطريق الأرخص والأسرع قبل الزحمة.",
    subheadline: "اختار منين ورايح فين، وشوف التكلفة والزحمة والتبديلات فورًا.",
    pain: "فيصل والهرم فيهم ألم يومي: انتظار، تحويلات، وسؤال متكرر: أركب إيه النهارده؟",
    promise: "مواصلات يحسبلك الطريق ويخلي أهل المنطقة يساعدوا بعض بتحديثات مباشرة.",
    socialProof: "+3,910 بحث عن خطوط فيصل هذا الأسبوع",
    primaryFrom: "فيصل",
    primaryTo: "رمسيس",
    heroMinutes: 42,
    heroFare: 18,
    heroTransfers: 2,
    traffic: "عالية",
    hotRoutes: [
      { from: "فيصل", to: "رمسيس", minutes: 42, fare: 18, pressure: "عالي" },
      { from: "فيصل", to: "مدينة نصر", minutes: 58, fare: 24, pressure: "متوسط" },
      { from: "الهرم", to: "جامعة القاهرة", minutes: 24, fare: 10, pressure: "متوسط" },
    ],
    dailyMoment: "تنبيه صباحي: خطك المعتاد عليه تأخير؟ البديل أسرع 12 دقيقة.",
    whatsappGroupLine: "ابعت لجروب فيصل/الهرم يشوفوا الزحمة والبديل.",
    challengeTitle: "تحدي خط فيصل هذا الأسبوع",
    challengeReward: "لقب خبير فيصل + صفحة إنجاز قابلة للمشاركة",
  },
  {
    slug: "nasr-city",
    path: "/nasr-city",
    areaSlug: "nasr-city",
    name: "مدينة نصر",
    audience: "موظفي وطلاب مدينة نصر واللي خارجين منها وقت الذروة",
    headline: "خارج من مدينة نصر؟ شوف الزحمة والبدائل قبل ما تتحرك.",
    subheadline: "عباس العقاد، مكرم، الحي العاشر — اعرف الخط واقف ولا سالك من الناس اللي راكبة دلوقتي.",
    pain: "وقت الذروة في مدينة نصر بيغيّر الطريق كله؛ لازم تعرف البديل قبل ما تنزل.",
    promise: "مواصلات يديك route واضح + بلاغات المجتمع + مشاركة واتساب للجروب.",
    socialProof: "+4,480 بحث عن خطوط مدينة نصر هذا الأسبوع",
    primaryFrom: "مدينة نصر",
    primaryTo: "رمسيس",
    heroMinutes: 44,
    heroFare: 20,
    heroTransfers: 1,
    traffic: "عالية",
    hotRoutes: [
      { from: "مدينة نصر", to: "رمسيس", minutes: 44, fare: 20, pressure: "عالي" },
      { from: "مدينة نصر", to: "التحرير", minutes: 39, fare: 18, pressure: "متوسط" },
      { from: "مدينة نصر", to: "المعادي", minutes: 55, fare: 26, pressure: "متوسط" },
    ],
    dailyMoment: "اسأل أهل الخط: الحي العاشر واقف ولا سالك دلوقتي؟",
    whatsappGroupLine: "ابعت لجروب الشغل/الكلية في مدينة نصر يشوفوا البدائل.",
    challengeTitle: "خلّي مدينة نصر تظهر على الخريطة",
    challengeReward: "لقب خبير مدينة نصر + leaderboard محلي",
  },
];

export function getCampaignByPath(pathname: string): LaunchCampaign | undefined {
  const clean = pathname.replace(/\/$/, "") || "/";
  return LAUNCH_CAMPAIGNS.find((campaign) => campaign.path === clean || `/${campaign.slug}` === clean);
}

export function campaignPlannerUrl(campaign: LaunchCampaign, from = campaign.primaryFrom, to = campaign.primaryTo) {
  return `/planner?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&src=launch-${campaign.slug}`;
}

export function campaignShareText(campaign: LaunchCampaign, url: string) {
  return `${campaign.headline}\n${campaign.promise}\n${campaign.whatsappGroupLine}\nجرب الطريق هنا:\n${url}`;
}

export function campaignWhatsappUrl(campaign: LaunchCampaign, url: string) {
  return `https://wa.me/?text=${encodeURIComponent(campaignShareText(campaign, url))}`;
}
