import { handleInteraction } from "../src/interactions.js";
import { PAUSED, pausedResponse } from "../src/pause.js";
import { createSupabaseStore } from "../src/store.js";
import { verifyDiscordSignature } from "../src/verify.js";

const store = createSupabaseStore(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Discord POSTs every slash command and button click here (set as the app's "Interactions Endpoint URL").
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("x-signature-ed25519") ?? "";
  const timestamp = request.headers.get("x-signature-timestamp") ?? "";

  if (!verifyDiscordSignature(process.env.DISCORD_PUBLIC_KEY!, signature, timestamp, rawBody)) {
    return new Response("invalid request signature", { status: 401 });
  }

  try {
    const interaction = JSON.parse(rawBody);
    if (PAUSED) return Response.json(pausedResponse(interaction));
    return Response.json(await handleInteraction(interaction, store));
  } catch (err) {
    console.error(err);
    return Response.json({ type: 4, data: { content: "Something went wrong. Try again or ask an organizer.", flags: 64 } });
  }
}
