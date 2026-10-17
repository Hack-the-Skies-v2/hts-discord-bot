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
  it("renders leaderboard with medals, a trivia note beside each score, and a footnote", () => {
    const out = formatLeaderboard([
      { discordId: "1", balance: 412, triviaPoints: 50, triviaMax: 50 },
      { discordId: "2", balance: 10, triviaPoints: 10, triviaMax: 50 },
    ]);
    expect(out).toContain("🥇 <@1> — 412 pts (trivia 50/50)");
    expect(out).toContain("🥈 <@2> — 10 pts (trivia 10/50)");
    expect(out).toContain("Trivia is capped at 50 points per person.");
  });
  it("handles an empty leaderboard and an uncapped trivia action", () => {
    expect(formatLeaderboard([])).toMatch(/No one/);
    const out = formatLeaderboard([{ discordId: "1", balance: 5, triviaPoints: 5, triviaMax: null }]);
    expect(out).toContain("(trivia 5)");
    expect(out).not.toMatch(/capped/);
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
