import { dataClient } from "@/marketing/integrations/data/client";
import { trackGrowthEvent } from "@/marketing/lib/growth";

export type LiveQuestion = {
  id: string;
  asker_id: string;
  trip_id: string;
  rider_id: string;
  body: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
};

export async function askLiveRider(tripId: string, body: string): Promise<string> {
  const { data, error } = await dataClient.rpc("ask_live_rider", {
    _trip_id: tripId,
    _body: body.trim(),
  });
  if (error) throw error;
  return data as string;
}

export async function answerLiveQuestion(id: string, answer: string) {
  const { error } = await dataClient.rpc("answer_live_question", {
    _id: id,
    _answer: answer.trim(),
  });
  if (error) throw error;
  void trackGrowthEvent("question_answered", { question_id: id });
}

export async function fetchMyInbox(): Promise<LiveQuestion[]> {
  const { data: u } = await dataClient.auth.getUser();
  if (!u.user) return [];
  const { data, error } = await dataClient
    .from("live_questions")
    .select("*")
    .eq("rider_id", u.user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as LiveQuestion[];
}

export async function fetchMyAsked(): Promise<LiveQuestion[]> {
  const { data: u } = await dataClient.auth.getUser();
  if (!u.user) return [];
  const { data, error } = await dataClient
    .from("live_questions")
    .select("*")
    .eq("asker_id", u.user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as LiveQuestion[];
}
