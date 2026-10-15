import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Question } from "./logic.js";

export interface Store {
  getLinkedUserId(discordId: string): Promise<string | null>;
  findUserIdByEmail(email: string): Promise<string | null>;
  /** True for accepted hackers/mentors/judges and organizers. */
  isAcceptedParticipant(userId: string, email: string): Promise<boolean>;
  linkDiscord(discordId: string, userId: string): Promise<"ok" | "user-taken">;
  /** Active questions this user has never been issued. */
  listUnseenQuestions(userId: string): Promise<Question[]>;
  /** Frees up this user's finished questions they didn't get right, so they can be asked again. */
  recycleQuestions(userId: string): Promise<void>;
  /** Marks a question as issued to this user. Returns false if they already have it. */
  issueQuestion(userId: string, questionId: string): Promise<boolean>;
  getQuestion(id: string): Promise<Question | null>;
  /** Closes an issued question (answered or expired). Returns false if it was already closed. */
  respondToQuestion(userId: string, questionId: string, correct: boolean): Promise<boolean>;
  /** How many trivia awards the user has and the cap (null = unlimited). */
  getTriviaProgress(userId: string): Promise<{ earned: number; max: number | null }>;
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

    async listUnseenQuestions(userId) {
      const { data: seen, error: seenError } = await db.from("trivia_answers").select("question_id").eq("user_id", userId);
      if (seenError) throw seenError;
      const { data, error } = await db.from("trivia_questions").select("*").eq("active", true);
      if (error) throw error;
      const seenIds = new Set(seen?.map((r) => r.question_id as string));
      return (data as QuestionRow[]).filter((r) => !seenIds.has(r.id)).map(toQuestion);
    },

    async recycleQuestions(userId) {
      const { error } = await db.from("trivia_answers").delete().eq("user_id", userId).eq("correct", false).eq("responded", true);
      if (error) throw error;
    },

    async issueQuestion(userId, questionId) {
      const { error } = await db
        .from("trivia_answers")
        .insert({ user_id: userId, question_id: questionId, correct: false, responded: false });
      if (error?.code === "23505") return false;
      if (error) throw error;
      return true;
    },

    async getQuestion(id) {
      const { data, error } = await db.from("trivia_questions").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? toQuestion(data as QuestionRow) : null;
    },

    async respondToQuestion(userId, questionId, correct) {
      const { data, error } = await db
        .from("trivia_answers")
        .update({ correct, responded: true, answered_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("question_id", questionId)
        .eq("responded", false)
        .select("question_id");
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },

    async getTriviaProgress(userId) {
      const { data: action, error: actionError } = await db
        .from("point_actions")
        .select("id, max_redemptions")
        .eq("name", TRIVIA_ACTION)
        .single();
      if (actionError) throw actionError;
      const { count, error } = await db
        .from("point_earnings")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("point_action_id", action.id);
      if (error) throw error;
      return { earned: count ?? 0, max: action.max_redemptions as number | null };
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
