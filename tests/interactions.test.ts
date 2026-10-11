import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { handleInteraction } from "../src/interactions.js";
import type { Question } from "../src/logic.js";
import type { Store } from "../src/store.js";
import { verifyDiscordSignature } from "../src/verify.js";

const question: Question = { id: "q1", question: "?", choices: ["right", "wrong"], correctIndex: 0, timeLimitSeconds: 30 };

function fakeStore(overrides: Partial<Store> = {}) {
  const asked: string[] = [];
  const answered = new Set<string>();
  const store: Store = {
    getLinkedUserId: async (d) => (d === "linked" ? "user-1" : null),
    findUserIdByEmail: async (e) => (e === "hacker@example.com" ? "user-1" : null),
    isAcceptedParticipant: async () => true,
    linkDiscord: async () => "ok",
    listQuestions: async () => [question],
    markQuestionAsked: async (id) => void asked.push(id),
    getQuestion: async () => question,
    recordAnswer: async (u, q) => (answered.has(`${u}:${q}`) ? false : (answered.add(`${u}:${q}`), true)),
    getTriviaProgress: async () => ({ earned: 0, max: null }),
    awardTriviaPoints: async () => 10,
    getBalance: async () => 40,
    leaderboard: async () => [{ discordId: "1", balance: 5 }],
    ...overrides,
  };
  return { store, asked };
}

const command = (name: string, extra: object = {}) => ({ type: 2, data: { name, ...extra }, member: { user: { id: "linked" }, permissions: "0" } });
const click = (choice: number, ageMs: number, now: number) => ({
  type: 3,
  data: { custom_id: `trivia:q1:${choice}` },
  member: { user: { id: "linked" } },
  message: { timestamp: new Date(now - ageMs).toISOString() },
});

describe("handleInteraction", () => {
  it("answers Discord's PING", async () => {
    expect(await handleInteraction({ type: 1 }, fakeStore().store)).toEqual({ type: 1 });
  });

  it("/points replies privately with the balance", async () => {
    const res = await handleInteraction(command("points"), fakeStore().store);
    expect(res.data).toMatchObject({ flags: 64 });
    expect(res.data?.content).toContain("40");
  });

  it("/link links an accepted hacker", async () => {
    const res = await handleInteraction(command("link", { options: [{ name: "email", value: "hacker@example.com" }] }), fakeStore().store);
    expect(res.data?.content).toMatch(/Linked/);
  });

  it("/leaderboard is public and doesn't ping anyone", async () => {
    const res = await handleInteraction(command("leaderboard"), fakeStore().store);
    expect(res.data?.flags).toBeUndefined();
    expect(res.data?.allowed_mentions).toEqual({ parse: [] });
  });

  it("/trivia is organizers-only", async () => {
    const { store, asked } = fakeStore();
    const res = await handleInteraction(command("trivia"), store);
    expect(res.data?.content).toMatch(/Only organizers/);
    expect(asked).toEqual([]);
  });

  it("/trivia posts a question with buttons and marks it asked", async () => {
    const { store, asked } = fakeStore();
    const res = await handleInteraction({ ...command("trivia"), member: { user: { id: "o" }, permissions: String(1 << 5) } }, store);
    expect(asked).toEqual(["q1"]);
    expect((res.data?.components as { components: unknown[] }[])[0].components).toHaveLength(2);
  });

  it("awards points for a correct on-time click, once", async () => {
    const { store } = fakeStore();
    const now = Date.now();
    expect((await handleInteraction(click(0, 5_000, now), store, now)).data?.content).toMatch(/Correct/);
    expect((await handleInteraction(click(0, 6_000, now), store, now)).data?.content).toMatch(/already answered/);
  });

  it("reveals the answer instead of scoring after the time limit", async () => {
    const now = Date.now();
    const res = await handleInteraction(click(0, 31_000, now), fakeStore().store, now);
    expect(res.data?.content).toMatch(/Time's up.*right/);
  });
});

describe("verifyDiscordSignature", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyHex = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
  const body = '{"type":1}';
  const timestamp = "1700000000";
  const signature = sign(null, Buffer.from(timestamp + body), privateKey).toString("hex");

  it("accepts a valid signature and rejects tampering", () => {
    expect(verifyDiscordSignature(publicKeyHex, signature, timestamp, body)).toBe(true);
    expect(verifyDiscordSignature(publicKeyHex, signature, timestamp, '{"type":2}')).toBe(false);
    expect(verifyDiscordSignature(publicKeyHex, "00".repeat(64), timestamp, body)).toBe(false);
    expect(verifyDiscordSignature("nothex", signature, timestamp, body)).toBe(false);
  });
});
