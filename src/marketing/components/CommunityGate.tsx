import { Link } from "react-router-dom";
import { ArrowRight, Bus, Sparkles } from "lucide-react";
import { isCommunityEnabled, shouldShowLocalDataNotice } from "@/marketing/lib/communityFlags";

/**
 * Wraps the community / marketing routes in App.tsx. When the feature gate
 * is OFF (production default), renders a clean "coming soon" page instead
 * of letting users post to a fake backend. When ON, prefixes the route's
 * UI with a small banner explaining that data is local-only.
 *
 * No community route source file had to be touched — we wrap once at the
 * router boundary and rely on the existing `dataClient` API surface.
 */
export function CommunityGate({ children }: { children: React.ReactNode }) {
  if (!isCommunityEnabled()) return <CommunityComingSoon />;
  return (
    <>
      {shouldShowLocalDataNotice() ? <LocalDataDemoBanner /> : null}
      {children}
    </>
  );
}

function CommunityComingSoon() {
  return (
    <div
      dir="rtl"
      role="status"
      className="min-h-screen bg-background grid place-items-center px-5 py-10"
    >
      <div className="w-full max-w-md rounded-2xl border-2 border-secondary bg-surface p-6 shadow-tactile">
        <div className="flex items-center gap-3 text-secondary">
          <div className="rounded-xl bg-primary border-2 border-secondary p-2 shadow-tactile-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-black">المجتمع قيد التحضير</h1>
        </div>

        <p className="mt-3 text-sm font-semibold text-muted-foreground leading-relaxed">
          ميزات المجتمع (التنبيهات، القنوات، الرحلات الجماعية، لوحة الصدارة،
          الملف العام…) لسه بنوصّلها بالـ backend الرسمي. عرضنا للنسخة الحالية
          وقت الاختبار كان بيخزّن عندك على الجهاز فقط، فمؤقتاً قفّلناها لحد ما
          تتحوّل لمصدر بيانات واحد آمن مع باقي التطبيق.
        </p>

        <p className="mt-3 text-xs font-bold text-muted-foreground/80 leading-relaxed">
          لو إنت مطوّر/مشغّل وعايز تشوفها في وضع المعاينة، فعّل العلم
          <code className="mx-1 rounded bg-muted px-1.5 py-0.5">VITE_COMMUNITY_FEATURES_ENABLED=true</code>
          وأعد البناء.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <Link
            to="/"
            className="flex h-12 items-center justify-center gap-2 rounded-lg border-2 border-secondary bg-secondary text-secondary-foreground font-black shadow-tactile-sm active:translate-y-0.5 active:shadow-none transition-transform"
          >
            <Bus className="h-5 w-5" strokeWidth={2.5} />
            <span>الرجوع للمواقف</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function LocalDataDemoBanner() {
  return (
    <div
      role="alert"
      dir="rtl"
      className="sticky top-0 z-40 w-full border-b-2 border-amber-500/40 bg-amber-50 px-4 py-2 text-center text-[11px] font-bold text-amber-900 leading-relaxed"
    >
      وضع معاينة محلية: التنبيهات والمحادثات وكل بيانات المجتمع محفوظة على
      جهازك فقط ولا تُشارَك مع باقي المستخدمين بعد.
    </div>
  );
}

export default CommunityGate;
