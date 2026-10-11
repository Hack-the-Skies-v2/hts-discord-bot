import { describe, expect, it } from "vitest";
import { normalizeSupabaseUrl } from "../src/store.js";
import { formatLeaderboard, formatQuestion, isValidEmail, isWithinTimeLimit, pickQuestion, type Question } from "../src/logic.js";

const q = (id: string): Question => ({ id, question: `Q${id}?`, choices: ["a", "b"], correctIndex: 0, timeLimitSeconds: 30 });

describe("isWithinTimeLimit", () => {
  it("accepts answers inside the window and rejects late ones", () => {
    expect(isWithinTimeLimit(0, 29_000, 30)).toBe(true);
    expect(isWithinTimeLimit(0, 30_000, 30)).toBe(true);
    expect(isWithinTimeLimit(0, 30_001, 30)).toBe(false);
  });
});

describe("pickQuestion", () => {
  it("skips already-asked questions", () => {
    expect(pickQuestion([q("1"), q("2")], new Set(["1"]))?.id).toBe("2");
  });
  it("returns null when everything was asked", () => {
    expect(pickQuestion([q("1")], new Set(["1"]))).toBeNull();
  });
});

describe("formatters", () => {
  it("labels choices A, B, ...", () => {
    expect(formatQuestion(q("1"))).toContain("**B)** b");
  });
  it("renders leaderboard with medals and handles empty", () => {
    expect(formatLeaderboard([{ discordId: "1", balance: 50 }, { discordId: "2", balance: 10 }])).toBe("🥇 <@1> — 50 pts\n🥈 <@2> — 10 pts");
    expect(formatLeaderboard([])).toMatch(/No one/);
  });
  it("validates emails", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
  });
});

describe("normalizeSupabaseUrl", () => {
  it("strips paths so a pasted REST URL still works", () => {
    expect(normalizeSupabaseUrl("https://abc.supabase.co/rest/v1/")).toBe("https://abc.supabase.co");
    expect(normalizeSupabaseUrl(" https://abc.supabase.co ")).toBe("https://abc.supabase.co");
  });
});
