import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { handleInteraction } from "../src/interactions.js";
import { verifyDiscordSignature } from "../src/verify.js";
import { fakeStore } from "./fakeStore.js";

const command = (name: string, who = "linked", extra: object = {}) => ({ type: 2, data: { name, ...extra }, member: { user: { id: who } } });
const click = (choice: number, ageMs: number, now: number, questionId = "q1") => ({
  type: 3,
  data: { custom_id: `trivia:${questionId}:${choice}` },
  member: { user: { id: "linked" } },
  message: { timestamp: new Date(now - ageMs).toISOString() },
});
const first = () => 0; // always picks the first unseen question (q1)

describe("handleInteraction", () => {
  it("answers Discord's PING", async () => {
    expect(await handleInteraction({ type: 1 }, fakeStore().store)).toEqual({ type: 1 });
  });

  it("/points replies privately with the balance", async () => {
    const res = await handleInteraction(command("points"), fakeStore().store);
    expect(res.data).toMatchObject({ flags: 64 });
    expect(res.data?.content).toContain("0");
  });

  it("/link links an accepted hacker", async () => {
    const res = await handleInteraction(command("link", "d9", { options: [{ name: "email", value: "hacker@example.com" }] }), fakeStore().store);
    expect(res.data?.content).toMatch(/Linked/);
  });

  it("/leaderboard is public and doesn't ping anyone", async () => {
    const res = await handleInteraction(command("leaderboard"), fakeStore().store);
    expect(res.data?.flags).toBeUndefined();
    expect(res.data?.allowed_mentions).toEqual({ parse: [] });
  });
});

describe("personal /trivia", () => {
  it("any linked hacker gets a private question with buttons and a 10 second limit", async () => {
    const res = await handleInteraction(command("trivia"), fakeStore().store, Date.now(), first);
    expect(res.data).toMatchObject({ flags: 64 });
    expect(res.data?.content).toMatch(/One\?/);
    expect(res.data?.content).toMatch(/10s/);
    expect((res.data?.components as { components: unknown[] }[])[0].components).toHaveLength(2);
  });

  it("tells unlinked users to link first", async () => {
    const res = await handleInteraction(command("trivia", "stranger"), fakeStore().store);
    expect(res.data?.content).toMatch(/\/link/);
    expect(res.data?.components).toBeUndefined();
  });

  it("a correct click updates the message in place, removes the buttons and awards points", async () => {
    const { store, earnedCount } = fakeStore();
    const now = Date.now();
    await handleInteraction(command("trivia"), store, now, first);
    const res = await handleInteraction(click(0, 4_000, now), store, now);
    expect(res.type).toBe(7);
    expect(res.data).toMatchObject({ components: [] });
    expect(res.data?.content).toMatch(/Correct/);
    expect(earnedCount()).toBe(1);
  });

  it("a click after 10 seconds is expired and scores nothing", async () => {
    const { store, earnedCount } = fakeStore();
    const now = Date.now();
    await handleInteraction(command("trivia"), store, now, first);
    const res = await handleInteraction(click(0, 10_500, now), store, now);
    expect(res.data?.content).toMatch(/Time's up/);
    expect(earnedCount()).toBe(0);
  });

  it("falls back to the message id's timestamp when none is provided", async () => {
    const { store } = fakeStore();
    const now = Date.now();
    await handleInteraction(command("trivia"), store, now, first);
    const id = String((BigInt(now - 3_000) - 1420070400000n) << 22n);
    const res = await handleInteraction({ ...click(0, 0, now), message: { id } }, store, now);
    expect(res.data?.content).toMatch(/Correct/);
  });

  it("closes the question if the message time is unknown", async () => {
    const res = await handleInteraction({ ...click(0, 0, Date.now()), message: {} }, fakeStore().store);
    expect(res.data?.content).toMatch(/closed/);
  });
});

describe("channel restriction", () => {
  const allowed = ["trivia-channel"];
  const inChannel = (name: string, channel_id: string | undefined) => ({ ...command(name), channel_id });
  const run = (name: string, channel_id: string | undefined, store = fakeStore().store) =>
    handleInteraction(inChannel(name, channel_id), store, Date.now(), first, allowed);

  it("rejects every command used in another channel, privately, without touching the database", async () => {
    for (const name of ["link", "points", "leaderboard", "trivia"]) {
      const { store, rows } = fakeStore();
      const res = await run(name, "general", store);
      expect(res.data).toMatchObject({ flags: 64 });
      expect(res.data?.content).toContain("<#trivia-channel>");
      expect(rows.size).toBe(0);
    }
  });

  it("rejects commands with no channel information", async () => {
    expect((await run("points", undefined)).data?.content).toContain("<#trivia-channel>");
  });

  it("allows commands in the trivia channel", async () => {
    expect((await run("points", "trivia-channel")).data?.content).toMatch(/points/);
    expect((await run("trivia", "trivia-channel")).data?.content).toMatch(/One\?/);
  });

  it("allows commands anywhere when no channels are configured", async () => {
    const res = await handleInteraction(inChannel("points", "general"), fakeStore().store);
    expect(res.data?.content).toMatch(/points/);
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
