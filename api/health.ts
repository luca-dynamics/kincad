// Vercel serverless function — GET /api/health. Reports which providers have server keys.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { healthPayload } from "../server/handler.ts";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json(healthPayload());
}
