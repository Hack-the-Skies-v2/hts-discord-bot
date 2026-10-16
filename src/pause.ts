/**
 * Pause switch. While true, every command and button replies with a "taking a break" message and nothing
 * touches the database. Discord's health-check PING is still answered so the endpoint stays valid.
 * To resume: set this to false, commit and push.
 */
export const PAUSED = true;

const PAUSED_MESSAGE = "⏸️ The HTS bot is taking a short break. Trivia and points will be back soon!";

type PausableInteraction = { type: number };
export type PausedResponse = { type: number; data?: Record<string, unknown> };

export function pausedResponse(interaction: PausableInteraction): PausedResponse {
  if (interaction.type === 1) return { type: 1 }; // PING
  if (interaction.type === 3) return { type: 7, data: { content: PAUSED_MESSAGE, components: [] } }; // button: update in place
  return { type: 4, data: { content: PAUSED_MESSAGE, flags: 64 } };
}
