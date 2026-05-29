import type { BillingFeatureCatalogEntry, BillingFeatureKey } from '@/modules/shared/types';

export const FEATURE_CATALOG: BillingFeatureCatalogEntry[] = [
  { key: 'analytics', label: 'التحليلات', description: 'تقارير الطلب والجودة والتحديثات.' },
  { key: 'suggestions', label: 'الاقتراحات الآلية', description: 'اقتراحات تشغيلية للمشرفين.' },
  { key: 'interoperability', label: 'التوافق المفتوح', description: 'تصدير GTFS-like وأدوات التكامل.' },
  { key: 'import_export', label: 'الاستيراد والتصدير', description: 'Snapshot import/export وأدوات الترحيل.' },
  { key: 'live_ops', label: 'لوحة التشغيل الحية', description: 'مؤشرات التشغيل الحية والازدحام.' },
  { key: 'validation', label: 'التحقق من البيانات', description: 'Validation center وفحوصات الجاهزية.' },
  { key: 'drafts', label: 'دورة المسودات', description: 'Draft / review / publish.' },
  { key: 'team_management', label: 'إدارة الفريق', description: 'دعوات الفريق وتوزيع الأدوار.' },
  { key: 'custom_domain', label: 'Custom domain', description: 'ربط دومين خاص بالجهة.' },
  { key: 'white_label', label: 'White-label', description: 'تخصيص الهوية البصرية للجهة.' },
  { key: 'support_sla', label: 'Support SLA', description: 'قنوات دعم واتفاقية خدمة مميزة.' },
];

export function normalizeFeatureValue(value: unknown): boolean {
  if (value === true) return true;
  if (value === false || value == null) return false;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (!v) return false;
    return ['1', 'true', 'yes', 'enabled', 'on', 'active', 'included'].includes(v);
  }
  return Boolean(value);
}

export function hasFeature(features: Record<string, unknown> | null | undefined, feature: BillingFeatureKey): boolean {
  return normalizeFeatureValue(features?.[feature]);
}

export function featureMeta(key: BillingFeatureKey): BillingFeatureCatalogEntry {
  return FEATURE_CATALOG.find((item) => item.key === key) ?? { key, label: key, description: '' };
}
