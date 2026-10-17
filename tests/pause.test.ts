import { describe, expect, it } from "vitest";
import { PAUSED, pausedResponse } from "../src/pause.js";

describe("pausedResponse", () => {
  it("still answers Discord's PING so the endpoint stays valid", () => {
    expect(pausedResponse({ type: 1 })).toEqual({ type: 1 });
  });

  it("replies privately to slash commands", () => {
    const res = pausedResponse({ type: 2 });
    expect(res.type).toBe(4);
    expect(res.data).toMatchObject({ flags: 64 });
    expect(res.data?.content).toMatch(/break/);
  });

  it("updates a question message in place and removes its buttons", () => {
    const res = pausedResponse({ type: 3 });
    expect(res.type).toBe(7);
    expect(res.data).toMatchObject({ components: [] });
  });
});

describe("pause switch", () => {
  it("is a boolean (true = paused, false = running)", () => {
    expect(typeof PAUSED).toBe("boolean");
  });
});
