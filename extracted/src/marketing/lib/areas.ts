export type AreaRoute = {
  from: string;
  to: string;
  searches: number;
  averageMinutes: number;
  averageFare: number;
  pressure: "خفيف" | "متوسط" | "عالي";
};

export type AreaReport = {
  id: string;
  title: string;
  detail: string;
  timeAgo: string;
  severity: "low" | "medium" | "high";
};

export type AreaContributor = {
  rank: number;
  name: string;
  points: number;
  badge: string;
  helped: number;
};

export type AreaChallenge = {
  title: string;
  description: string;
  goal: string;
  reward: string;
  progress: number;
};

export type AreaPage = {
  slug: string;
  name: string;
  headline: string;
  communityName: string;
  memberCount: number;
  weeklySearches: number;
  activeReports: number;
  topRoute: string;
  challenge: AreaChallenge;
  routes: AreaRoute[];
  reports: AreaReport[];
  contributors: AreaContributor[];
};

export const AREA_PAGES: AreaPage[] = [
  {
    slug: "faisal",
    name: "فيصل",
    headline: "تحدي خط فيصل هذا الأسبوع",
    communityName: "أهل فيصل على مواصلات",
    memberCount: 842,
    weeklySearches: 3910,
    activeReports: 18,
    topRoute: "فيصل - رمسيس",
    challenge: {
      title: "خلّي فيصل أوضح على الخريطة",
      description: "أكد المحطات، بلّغ عن الزحمة، وساعد أي حد نازل من فيصل يعرف البديل الأسرع.",
      goal: "100 بلاغ أو تأكيد مفيد هذا الأسبوع",
      reward: "لقب خبير فيصل + ظهور في كارت المنطقة",
      progress: 68,
    },
    routes: [
      { from: "فيصل", to: "رمسيس", searches: 980, averageMinutes: 42, averageFare: 18, pressure: "عالي" },
      { from: "فيصل", to: "مدينة نصر", searches: 760, averageMinutes: 58, averageFare: 24, pressure: "متوسط" },
      { from: "فيصل", to: "التحرير", searches: 640, averageMinutes: 31, averageFare: 14, pressure: "متوسط" },
    ],
    reports: [
      { id: "f-1", title: "ضغط عند موقف فيصل الرئيسي", detail: "التحميل بطيء والانتظار أطول من المعتاد.", timeAgo: "منذ 12 دقيقة", severity: "high" },
      { id: "f-2", title: "بديل أسرع ناحية الجيزة", detail: "ناس كتير بتأكد إن طريق الجيزة سالك نسبيًا.", timeAgo: "منذ 27 دقيقة", severity: "medium" },
      { id: "f-3", title: "تأكيد محطة جديدة", detail: "تم تأكيد نقطة ركوب قريبة من شارع العشرين.", timeAgo: "منذ ساعة", severity: "low" },
    ],
    contributors: [
      { rank: 1, name: "أحمد", points: 1280, badge: "خبير فيصل", helped: 127 },
      { rank: 2, name: "منة", points: 1030, badge: "منقذة الخط", helped: 96 },
      { rank: 3, name: "كريم", points: 875, badge: "عين الزحمة", helped: 81 },
    ],
  },
  {
    slug: "ramses",
    name: "رمسيس",
    headline: "مين أكثر شخص ساعد ركاب رمسيس؟",
    communityName: "أهل رمسيس على مواصلات",
    memberCount: 1260,
    weeklySearches: 5220,
    activeReports: 31,
    topRoute: "رمسيس - مدينة نصر",
    challenge: {
      title: "تحدي رمسيس المباشر",
      description: "رمسيس نقطة تقاطع كبيرة؛ أي بلاغ مفيد هنا ممكن يوفر وقت لآلاف الناس.",
      goal: "150 مساعدة مفيدة لركاب رمسيس",
      reward: "لقب منقذ رمسيس + أولوية ظهور البلاغات",
      progress: 74,
    },
    routes: [
      { from: "رمسيس", to: "مدينة نصر", searches: 1320, averageMinutes: 45, averageFare: 20, pressure: "عالي" },
      { from: "رمسيس", to: "العتبة", searches: 950, averageMinutes: 16, averageFare: 8, pressure: "متوسط" },
      { from: "رمسيس", to: "التجمع", searches: 710, averageMinutes: 62, averageFare: 28, pressure: "عالي" },
    ],
    reports: [
      { id: "r-1", title: "زحمة عند مدخل الموقف", detail: "التحميل متكدس والبدائل ناحية المترو أسرع.", timeAgo: "منذ 8 دقائق", severity: "high" },
      { id: "r-2", title: "خط مدينة نصر شغال", detail: "في عربيات متاحة لكن الانتظار متوسط.", timeAgo: "منذ 21 دقيقة", severity: "medium" },
      { id: "r-3", title: "سؤال متكرر", detail: "ناس كتير بتسأل عن أسرع بديل للتجمع.", timeAgo: "منذ 45 دقيقة", severity: "low" },
    ],
    contributors: [
      { rank: 1, name: "سارة", points: 1510, badge: "منقذة رمسيس", helped: 168 },
      { rank: 2, name: "محمود", points: 1190, badge: "خبير التحويلات", helped: 124 },
      { rank: 3, name: "يوسف", points: 940, badge: "عين الموقف", helped: 102 },
    ],
  },
  {
    slug: "nasr-city",
    name: "مدينة نصر",
    headline: "خلّي مدينة نصر تظهر على الخريطة",
    communityName: "أهل مدينة نصر على مواصلات",
    memberCount: 980,
    weeklySearches: 4480,
    activeReports: 24,
    topRoute: "مدينة نصر - رمسيس",
    challenge: {
      title: "تحدي خطوط مدينة نصر",
      description: "أكد خطوط عباس العقاد، مكرم، والحي العاشر علشان الناس تختار أسرع بديل.",
      goal: "120 تأكيد محطة أو بلاغ زحمة",
      reward: "لقب خبير مدينة نصر + صفحة منطقة قابلة للمشاركة",
      progress: 59,
    },
    routes: [
      { from: "مدينة نصر", to: "رمسيس", searches: 1120, averageMinutes: 44, averageFare: 20, pressure: "عالي" },
      { from: "مدينة نصر", to: "التحرير", searches: 820, averageMinutes: 39, averageFare: 18, pressure: "متوسط" },
      { from: "مدينة نصر", to: "المعادي", searches: 690, averageMinutes: 55, averageFare: 26, pressure: "متوسط" },
    ],
    reports: [
      { id: "n-1", title: "ضغط ناحية الحي العاشر", detail: "بلاغات متكررة عن تأخير في التحميل.", timeAgo: "منذ 15 دقيقة", severity: "high" },
      { id: "n-2", title: "عباس العقاد سالك نسبيًا", detail: "البديل أسرع لبعض الرحلات ناحية رمسيس.", timeAgo: "منذ 33 دقيقة", severity: "medium" },
      { id: "n-3", title: "تأكيد خط للمعادي", detail: "مستخدمين أكدوا نقطة ركوب جديدة.", timeAgo: "منذ ساعة", severity: "low" },
    ],
    contributors: [
      { rank: 1, name: "ليلى", points: 1345, badge: "خبيرة مدينة نصر", helped: 139 },
      { rank: 2, name: "عمر", points: 1110, badge: "منقذ الخط", helped: 117 },
      { rank: 3, name: "هاجر", points: 902, badge: "دليل المنطقة", helped: 88 },
    ],
  },
];

export function getAreaBySlug(slug?: string): AreaPage | undefined {
  return AREA_PAGES.find((area) => area.slug === slug);
}

export function areaShareText(area: AreaPage, url: string) {
  return `تحدي ${area.name} شغال على مواصلات.\nأكثر طريق بحثًا: ${area.topRoute}.\nلو أنت من المنطقة، ادخل ساعد الناس وشوف الزحمة والبدائل:\n${url}`;
}

export function areaWhatsappUrl(area: AreaPage, url: string) {
  return `https://wa.me/?text=${encodeURIComponent(areaShareText(area, url))}`;
}
