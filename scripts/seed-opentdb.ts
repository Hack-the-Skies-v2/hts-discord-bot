// Fills public.trivia_questions from Open Trivia DB. Safe to re-run: questions already in the table are skipped.
// Usage: npm run seed:opentdb [-- --categories 18,17,19 --amount 50]
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_CATEGORIES, buildUrl, toSeedRow, type OpenTdbQuestion, type SeedRow } from "../src/opentdb.js";
import { normalizeSupabaseUrl } from "../src/store.js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const args = process.argv.slice(2);
const flag = (name: string) => args[args.indexOf(`--${name}`) + 1];
const categories = args.includes("--categories") ? flag("categories").split(",").map(Number) : DEFAULT_CATEGORIES;
const amount = args.includes("--amount") ? Number(flag("amount")) : 50; // Open Trivia DB allows at most 50 per request

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Open Trivia DB allows one request per 5 seconds per IP.
async function fetchCategory(category: number): Promise<OpenTdbQuestion[]> {
  for (let n = amount; n >= 5; n = Math.floor(n / 2)) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await sleep(5500);
      const body = (await (await fetch(buildUrl(n, category))).json()) as { response_code: number; results: OpenTdbQuestion[] };
      if (body.response_code === 0) return body.results;
      if (body.response_code === 5) continue; // rate limited: wait and retry
      if (body.response_code === 1) break; // not enough questions in this category: ask for fewer
      throw new Error(`Open Trivia DB error ${body.response_code} for category ${category}`);
    }
  }
  return [];
}

const db = createClient(normalizeSupabaseUrl(url), key.trim(), { auth: { persistSession: false } });

let added = 0;
for (const category of categories) {
  const rows = (await fetchCategory(category)).map((q) => toSeedRow(q)).filter((r): r is SeedRow => r !== null);
  const { data, error } = await db
    .from("trivia_questions")
    .upsert(rows, { onConflict: "question", ignoreDuplicates: true })
    .select("id");
  if (error) throw error;
  added += data?.length ?? 0;
  console.log(`category ${category}: fetched ${rows.length}, new ${data?.length ?? 0}`);
}

const { count } = await db.from("trivia_questions").select("id", { count: "exact", head: true }).eq("active", true);
console.log(`Added ${added} new questions. ${count} active questions in the pool.`);
