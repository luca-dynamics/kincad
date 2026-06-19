// KINCAD AI proxy — LOCAL DEV server (tsx). On Vercel the same logic runs as serverless
// functions in api/*.ts; both share server/handler.ts. Keys come from .env locally.
//
// Run with:  npm run server   (tsx watch server/index.ts)
// Configure: paste keys into .env (copied from .env.example).

import express from "express";
import dotenv from "dotenv";
import { healthPayload, runCopilot, serverKey, type CopilotBody } from "./handler.ts";
import type { Provider } from "../shared/models.ts";

dotenv.config();

const PORT = Number(process.env.PORT) || 8787;
const app = express();
app.use(express.json({ limit: "8mb" })); // generous for image attachments

app.get("/api/health", (_req, res) => res.json(healthPayload()));

app.post("/api/copilot", async (req, res) => {
  const { status, body } = await runCopilot(req.body as CopilotBody);
  res.status(status).json(body);
});

app.listen(PORT, () => {
  console.log(`KINCAD AI proxy on http://localhost:${PORT}`);
  const have = (["anthropic", "openai", "google"] as Provider[]).filter((p) => serverKey(p));
  console.log(have.length ? `  server keys: ${have.join(", ")}` : "  no server keys set (BYOK only)");
});
