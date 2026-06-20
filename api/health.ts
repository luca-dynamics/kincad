// Vercel serverless function — GET /api/health. Reports which providers have server keys.
// Imports the runtime value from the pre-bundled single-file backend (api/_handler.js, built
// by scripts/bundle-server.mjs) so there are no fragile cross-file `.ts` imports at runtime.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { healthPayload } from "./_handler.js";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json(healthPayload());
}
