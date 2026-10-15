import { describe, expect, it } from "vitest";
import { buildUrl, shuffle, toSeedRow, type OpenTdbQuestion } from "../src/opentdb.js";

const enc = encodeURIComponent;
const multiple = (over: Partial<OpenTdbQuestion> = {}): OpenTdbQuestion => ({
  type: "multiple",
  question: enc("What does CPU stand for?"),
  correct_answer: enc("Central Processing Unit"),
  incorrect_answers: [enc("Computer Personal Unit"), enc("Central Process Utility"), enc("Core Program Unit")],
  ...over,
});

describe("toSeedRow", () => {
  it("decodes the URL encoding and points correct_index at the right answer", () => {
    const row = toSeedRow(multiple({ question: enc("Who's the \"best\" & brightest?") }))!;
    expect(row.question).toBe("Who's the \"best\" & brightest?");
    expect(row.choices).toHaveLength(4);
    expect(row.choices[row.correct_index]).toBe("Central Processing Unit");
    expect(row.time_limit_seconds).toBe(10);
  });

  it("shuffles the correct answer around instead of always putting it first", () => {
    const positions = new Set<number>();
    for (let i = 0; i < 60; i++) positions.add(toSeedRow(multiple())!.correct_index);
    expect(positions.size).toBeGreaterThan(1);
  });

  it("keeps true/false questions in True, False order", () => {
    const row = toSeedRow({ type: "boolean", question: enc("The sky is blue."), correct_answer: "False", incorrect_answers: ["True"] })!;
    expect(row.choices).toEqual(["True", "False"]);
    expect(row.correct_index).toBe(1);
  });

  it("drops questions that wouldn't display well", () => {
    expect(toSeedRow(multiple({ question: enc("x".repeat(401)) }))).toBeNull();
    expect(toSeedRow(multiple({ correct_answer: enc("y".repeat(81)) }))).toBeNull();
    expect(toSeedRow(multiple({ incorrect_answers: [enc("Central Processing Unit"), enc("A"), enc("B")] }))).toBeNull();
  });
});

describe("helpers", () => {
  it("shuffle keeps every item", () => {
    expect(shuffle([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });
  it("builds a url-encoded request", () => {
    expect(buildUrl(50, 18)).toBe("https://opentdb.com/api.php?amount=50&category=18&encode=url3986");
  });
});
