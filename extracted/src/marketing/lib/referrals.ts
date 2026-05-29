import { dataClient } from "@/marketing/integrations/data/client";
import { trackInviteOpenedOnce } from "@/marketing/lib/growth";

const REF_STORAGE_KEY = "pending_ref_code";

export function captureRefFromUrl(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  if (ref && /^[A-Z0-9]{4,12}$/i.test(ref)) {
    try {
      localStorage.setItem(REF_STORAGE_KEY, ref.toUpperCase());
      trackInviteOpenedOnce(ref);
    } catch { /* ignore */ }
  }
}

export function getPendingRef(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(REF_STORAGE_KEY);
  } catch { return null; }
}

export function clearPendingRef(): void {
  try { localStorage.removeItem(REF_STORAGE_KEY); } catch { /* ignore */ }
}

export type MyReferralInfo = {
  code: string;
  count: number;
  founderGoal: number;
  founderRemaining: number;
  founderUnlocked: boolean;
};

export async function getMyReferralInfo(): Promise<MyReferralInfo | null> {
  const { data: u } = await dataClient.auth.getUser();
  if (!u.user) return null;

  const [{ data: prof }, { count }] = await Promise.all([
    dataClient.from("profiles").select("referral_code").eq("user_id", u.user.id).maybeSingle(),
    dataClient.from("referrals").select("*", { count: "exact", head: true }).eq("referrer_id", u.user.id),
  ]);

  if (!prof?.referral_code) return null;
  const invited = count ?? 0;
  return {
    code: prof.referral_code as string,
    count: invited,
    founderGoal: 3,
    founderRemaining: Math.max(0, 3 - invited),
    founderUnlocked: invited >= 3,
  };
}

export function buildInviteUrl(code: string): string {
  if (typeof window === "undefined") return `/?ref=${code}`;
  return `${window.location.origin}/?ref=${code}`;
}

export function buildWhatsAppInvite(code: string): string {
  const url = buildInviteUrl(code);
  const msg = `🚌 جرّب تطبيق مواصلات معايا — بيدلك على أقرب موقف، تقدر تتابع رحلتي لايف، و بنبلغ بعض عن الزحمة والحوادث.\n\nسجّل بالكود ده وهتاخد 80 نقطة بدل 50 — وأنا كمان هاخد نقط 🎉\n\n${url}`;
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}
