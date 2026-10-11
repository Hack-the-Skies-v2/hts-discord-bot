import "dotenv/config";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

type Seed = { question: string; choices: string[]; correctIndex: number; timeLimitSeconds?: number };

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const db = createClient(url, key, { auth: { persistSession: false } });
const seeds: Seed[] = JSON.parse(readFileSync(new URL("./questions.json", import.meta.url), "utf8"));

const { error } = await db.from("trivia_questions").upsert(
  seeds.map((s) => ({
    question: s.question,
    choices: s.choices,
    correct_index: s.correctIndex,
    time_limit_seconds: s.timeLimitSeconds ?? 30,
  })),
  { onConflict: "question" },
);
if (error) throw error;
console.log(`Seeded ${seeds.length} questions.`);
