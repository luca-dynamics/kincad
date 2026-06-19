// Vercel serverless function — POST /api/copilot. Runs the engine-grounded tool loop for the
// chosen model. Keys come from Vercel project environment variables (or BYOK in the body).
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runCopilot, type CopilotBody } from "../server/handler.ts";

export const config = { maxDuration: 60 }; // tool loops can take several round-trips

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  const { status, body } = await runCopilot(req.body as CopilotBody);
  res.status(status).json(body);
}
