import { dataClient } from "@/marketing/integrations/data/client";

export type PublicBadge = {
  key: string;
  label: string;
  reason: string | null;
  created_at: string;
};

export type PublicProfileCard = {
  user_id: string;
  display_name: string;
  public_slug: string;
  points: number;
  referral_code: string;
  badge_label: string;
  people_helped: number;
  shared_trips: number;
  useful_alerts: number;
  answered_questions: number;
  favorite_area: string;
  favorite_line: string;
  latest_badges: PublicBadge[];
};

export async function fetchPublicProfileCard(slug: string): Promise<PublicProfileCard | null> {
  const cleanSlug = slug.trim().toLowerCase();
  if (!cleanSlug) return null;

  const { data, error } = await dataClient.rpc("get_public_profile_card" as never, { _slug: cleanSlug } as never);
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  return row as PublicProfileCard;
}

export function buildProfileUrl(slug: string): string {
  if (typeof window === "undefined") return `/u/${slug}`;
  return `${window.location.origin}/u/${slug}`;
}

export function buildProfileInviteUrl(profile: PublicProfileCard): string {
  const base = typeof window === "undefined" ? "" : window.location.origin;
  return `${base}/?ref=${encodeURIComponent(profile.referral_code)}`;
}

export function buildAchievementText(profile: PublicProfileCard): string {
  return `أنا ساعدت ${profile.people_helped} شخص يوصلوا أسرع على مواصلات 🚀\n\nلقبي: ${profile.badge_label}\nرحلات شاركتها: ${profile.shared_trips}\nبلاغات مفيدة: ${profile.useful_alerts}\nإجابات ساعدت ناس: ${profile.answered_questions}\n\nجرّب مواصلات من هنا: ${buildProfileInviteUrl(profile)}`;
}

export function buildWhatsAppAchievement(profile: PublicProfileCard): string {
  return `https://wa.me/?text=${encodeURIComponent(buildAchievementText(profile))}`;
}

export function buildFacebookAchievement(profile: PublicProfileCard): string {
  const url = buildProfileUrl(profile.public_slug);
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(buildAchievementText(profile))}`;
}
