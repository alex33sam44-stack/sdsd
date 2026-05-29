export type BillingPlanSeed = {
  code: string;
  name: string;
  description?: string;
  currency: string;
  monthlyPriceMinor: number | null;
  yearlyPriceMinor: number | null;
  includedSeats: number | null;
  defaultLimits: Record<string, number | null>;
  defaultFeatures: Record<string, boolean | string | number | null>;
  isPublic: boolean;
  sortOrder: number;
};

export const DEFAULT_BILLING_PLANS: BillingPlanSeed[] = [
  {
    code: 'starter',
    name: 'Starter',
    description: 'الخطة الأساسية للانطلاق الأولي.',
    currency: 'USD',
    monthlyPriceMinor: 0,
    yearlyPriceMinor: 0,
    includedSeats: 3,
    defaultLimits: {
      stations: 3,
      lines: 30,
      routeStops: 400,
      seats: 3,
    },
    defaultFeatures: {
      analytics: false,
      suggestions: false,
      interoperability: false,
      importExport: false,
      liveOps: true,
      validation: true,
      drafts: true,
      teamManagement: true,
      customDomain: false,
      whiteLabel: false,
      supportSla: false,
    },
    isPublic: true,
    sortOrder: 1,
  },
  {
    code: 'growth',
    name: 'Growth',
    description: 'لجهات تشغيل متوسطة تحتاج حدودًا أعلى وتقارير أفضل.',
    currency: 'USD',
    monthlyPriceMinor: 9900,
    yearlyPriceMinor: 99000,
    includedSeats: 15,
    defaultLimits: {
      stations: 15,
      lines: 150,
      routeStops: 3000,
      seats: 15,
    },
    defaultFeatures: {
      analytics: true,
      suggestions: true,
      interoperability: true,
      importExport: true,
      liveOps: true,
      validation: true,
      drafts: true,
      teamManagement: true,
      customDomain: false,
      whiteLabel: false,
      supportSla: false,
    },
    isPublic: true,
    sortOrder: 2,
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    description: 'للعملاء الكبار مع مرونة وحدود موسعة ودعم متقدم.',
    currency: 'USD',
    monthlyPriceMinor: null,
    yearlyPriceMinor: null,
    includedSeats: null,
    defaultLimits: {
      stations: null,
      lines: null,
      routeStops: null,
      seats: null,
    },
    defaultFeatures: {
      analytics: true,
      suggestions: true,
      interoperability: true,
      importExport: true,
      liveOps: true,
      validation: true,
      drafts: true,
      teamManagement: true,
      customDomain: true,
      whiteLabel: true,
      supportSla: true,
    },
    isPublic: true,
    sortOrder: 3,
  },
  {
    code: 'legacy',
    name: 'Legacy',
    description: 'خطة انتقالية للبيانات الحالية قبل ضبط الاشتراكات الفعلية.',
    currency: 'USD',
    monthlyPriceMinor: null,
    yearlyPriceMinor: null,
    includedSeats: null,
    defaultLimits: {
      stations: null,
      lines: null,
      routeStops: null,
      seats: null,
    },
    defaultFeatures: {
      analytics: true,
      suggestions: true,
      interoperability: true,
      importExport: true,
      liveOps: true,
      validation: true,
      drafts: true,
      teamManagement: true,
      customDomain: false,
      whiteLabel: false,
      supportSla: false,
    },
    isPublic: false,
    sortOrder: 99,
  },
];
