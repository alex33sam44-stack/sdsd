import { dataClient } from "@/marketing/integrations/data/client";

export type LineChannel = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  members_count: number;
  created_at: string;
};

export type ChannelMessage = {
  id: string;
  channel_id: string;
  user_id: string;
  display_name: string | null;
  body: string;
  created_at: string;
};

export async function listChannels(): Promise<LineChannel[]> {
  const { data, error } = await dataClient
    .from("line_channels")
    .select("*")
    .order("members_count", { ascending: false });
  if (error) throw error;
  return (data ?? []) as LineChannel[];
}

export async function getChannelBySlug(slug: string): Promise<LineChannel | null> {
  const { data, error } = await dataClient
    .from("line_channels")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as LineChannel) ?? null;
}

export async function createChannel(input: { slug: string; name: string; description?: string }) {
  const { data: u } = await dataClient.auth.getUser();
  if (!u.user) throw new Error("سجل دخول أولاً");
  const { data, error } = await dataClient
    .from("line_channels")
    .insert({
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      created_by: u.user.id,
    })
    .select()
    .single();
  if (error) throw error;
  return data as LineChannel;
}

export async function joinChannel(channelId: string) {
  const { data: u } = await dataClient.auth.getUser();
  if (!u.user) throw new Error("سجل دخول أولاً");
  const { error } = await dataClient
    .from("channel_members")
    .insert({ channel_id: channelId, user_id: u.user.id });
  // ignore duplicate
  if (error && !error.message.includes("duplicate")) throw error;
}

export async function isMember(channelId: string): Promise<boolean> {
  const { data: u } = await dataClient.auth.getUser();
  if (!u.user) return false;
  const { data } = await dataClient
    .from("channel_members")
    .select("channel_id")
    .eq("channel_id", channelId)
    .eq("user_id", u.user.id)
    .maybeSingle();
  return !!data;
}

export async function fetchMessages(channelId: string, limit = 100): Promise<ChannelMessage[]> {
  const { data, error } = await dataClient
    .from("channel_messages")
    .select("*")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as ChannelMessage[]).reverse();
}

export async function sendMessage(channelId: string, body: string) {
  const { data: u } = await dataClient.auth.getUser();
  if (!u.user) throw new Error("سجل دخول أولاً");
  const { data: p } = await dataClient
    .from("profiles")
    .select("display_name")
    .eq("user_id", u.user.id)
    .maybeSingle();
  const { error } = await dataClient.from("channel_messages").insert({
    channel_id: channelId,
    user_id: u.user.id,
    display_name: p?.display_name ?? "صديق",
    body: body.trim(),
  });
  if (error) throw error;
}

export function subscribeChannel(channelId: string, onMsg: (m: ChannelMessage) => void) {
  const ch = dataClient
    .channel(`channel-${channelId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "channel_messages", filter: `channel_id=eq.${channelId}` },
      (payload) => onMsg(payload.new as ChannelMessage),
    )
    .subscribe();
  return () => {
    void dataClient.removeChannel(ch);
  };
}
