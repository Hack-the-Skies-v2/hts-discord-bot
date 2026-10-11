import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Question } from "./logic.js";

export interface Store {
  getLinkedUserId(discordId: string): Promise<string | null>;
  findUserIdByEmail(email: string): Promise<string | null>;
  /** True for accepted hackers/mentors/judges and organizers. */
  isAcceptedParticipant(userId: string, email: string): Promise<boolean>;
  linkDiscord(discordId: string, userId: string): Promise<"ok" | "user-taken">;
  listQuestions(): Promise<Question[]>;
  markQuestionAsked(id: string): Promise<void>;
  getQuestion(id: string): Promise<Question | null>;
  /** Returns false if the user already answered this question. */
  recordAnswer(userId: string, questionId: string, correct: boolean): Promise<boolean>;
  awardTriviaPoints(userId: string): Promise<number>;
  getBalance(userId: string): Promise<number>;
  leaderboard(limit: number): Promise<{ discordId: string; balance: number }[]>;
}

const TRIVIA_ACTION = "Discord trivia";

type QuestionRow = {
  id: string;
  question: string;
  choices: string[];
  correct_index: number;
  time_limit_seconds: number;
};

const toQuestion = (r: QuestionRow): Question => ({
  id: r.id,
  question: r.question,
  choices: r.choices,
  correctIndex: r.correct_index,
  timeLimitSeconds: r.time_limit_seconds,
});

// Accept the project URL with or without a trailing path (e.g. ".../rest/v1/"); the client adds its own paths.
export const normalizeSupabaseUrl = (url: string) => new URL(url.trim()).origin;

export function createSupabaseStore(url: string, serviceRoleKey: string): Store {
  const db: SupabaseClient = createClient(normalizeSupabaseUrl(url), serviceRoleKey.trim(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return {
    async getLinkedUserId(discordId) {
      const { data, error } = await db.from("discord_links").select("user_id").eq("discord_id", discordId).maybeSingle();
      if (error) throw error;
      return data?.user_id ?? null;
    },

    async findUserIdByEmail(email) {
      const target = email.toLowerCase();
      const { data: applicant, error: viewError } = await db
        .from("application_details_view")
        .select("id")
        .ilike("email", target.replace(/[\\%_]/g, "\\$&"))
        .limit(1);
      if (viewError) throw viewError;
      if (applicant?.length) return applicant[0].id as string;
      for (let page = 1; ; page++) {
        const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw error;
        const match = data.users.find((u) => u.email?.toLowerCase() === target);
        if (match) return match.id;
        if (data.users.length < 200) return null;
      }
    },

    async isAcceptedParticipant(userId, email) {
      const { data, error } = await db.from("applications").select("user_id").eq("user_id", userId).eq("status", "accepted").limit(1);
      if (error) throw error;
      if (data?.length) return true;
      const { data: organizer, error: organizerError } = await db.from("organizer_allowlist").select("email").ilike("email", email).limit(1);
      if (organizerError) throw organizerError;
      return (organizer?.length ?? 0) > 0;
    },

    async linkDiscord(discordId, userId) {
      const { error } = await db.from("discord_links").upsert({ discord_id: discordId, user_id: userId }, { onConflict: "discord_id" });
      if (error?.code === "23505") return "user-taken";
      if (error) throw error;
      return "ok";
    },

    async listQuestions() {
      const { data, error } = await db.from("trivia_questions").select("*").eq("active", true).is("asked_at", null);
      if (error) throw error;
      return (data as QuestionRow[]).map(toQuestion);
    },

    async markQuestionAsked(id) {
      const { error } = await db.from("trivia_questions").update({ asked_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },

    async getQuestion(id) {
      const { data, error } = await db.from("trivia_questions").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? toQuestion(data as QuestionRow) : null;
    },

    async recordAnswer(userId, questionId, correct) {
      const { error } = await db.from("trivia_answers").insert({ user_id: userId, question_id: questionId, correct });
      if (error?.code === "23505") return false;
      if (error) throw error;
      return true;
    },

    async awardTriviaPoints(userId) {
      const { data: action, error: actionError } = await db
        .from("point_actions")
        .select("id, points")
        .eq("name", TRIVIA_ACTION)
        .single();
      if (actionError) throw actionError;
      const { error } = await db.from("point_earnings").insert({ user_id: userId, point_action_id: action.id });
      if (error) throw error;
      return action.points as number;
    },

    async getBalance(userId) {
      const { data, error } = await db.from("user_points").select("balance").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data?.balance ?? 0;
    },

    async leaderboard(limit) {
      const { data: links, error } = await db.from("discord_links").select("discord_id, user_id");
      if (error) throw error;
      if (!links?.length) return [];
      const { data: points, error: pointsError } = await db
        .from("user_points")
        .select("user_id, balance")
        .in("user_id", links.map((l) => l.user_id));
      if (pointsError) throw pointsError;
      const balances = new Map(points?.map((p) => [p.user_id, p.balance as number]));
      return links
        .map((l) => ({ discordId: l.discord_id as string, balance: balances.get(l.user_id) ?? 0 }))
        .sort((a, b) => b.balance - a.balance)
        .slice(0, limit);
    },
  };
}
