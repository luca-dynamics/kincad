# KINCAD

**An AI-assisted CAD agent for kinematic analysis & synthesis of planar mechanisms.**

KINCAD is a CAD-style workspace where you describe a mechanism (or a 3D part) in plain English
and an engineering agent builds, animates, analyses, and explains it — with **every number coming
from a deterministic solver**, never the language model.

> Mechanical Engineering Final-Year Project · Ibidun Quyum Babatunde · `2021/1/82451EM`

## Features

- **Conversational agent** — describe a four-bar or slider-crank and it sets it up, runs the
  analysis, and explains the results. Conceptual questions stay in a clean chat; building a
  mechanism reveals the workspace.
- **Deterministic kinematics engine** — closed-form position/velocity/acceleration (vector-loop /
  Freudenstein method), Grashof classification, transmission angle, mechanical advantage, coupler
  curves. Validated against textbook examples with unit tests.
- **Synthesis** — Freudenstein function generation and two/three-position synthesis.
- **2D & 3D workspace** — animated canvas with draggable joints, plus a real-time three.js 3D view.
- **Freeform text-to-CAD** — the agent generates parametric 3D parts (primitives + boolean CSG),
  rendered in three.js and exportable to **STL**.
- **Multi-model** — Claude, GPT and Gemini via a key-safe proxy, with **BYOK** support and an
  offline rule-based fallback.
- **Reports** — PDF analysis report + PNG / STL export. Light (cream) and dark themes.

## Tech stack

React + TypeScript + Vite · Tailwind v4 · three.js / @react-three/fiber · three-bvh-csg ·
Node/Express proxy (Anthropic / OpenAI / Google) · Vitest.

## Run locally

```bash
npm install
cp .env.example .env      # paste the API keys you have (optional — BYOK also works)
npm run dev:full          # Vite app + AI proxy together
```

Open http://localhost:5174. Without keys, the **Offline** model and the full deterministic
engine still work; add keys (in `.env` or via the in-app model menu) to use cloud models.

## Scripts

- `npm run dev:full` — app + proxy (recommended for development)
- `npm run dev` — Vite app only · `npm run server` — AI proxy only
- `npm test` — engine + CAD unit tests
- `npm run build` — production build

## Deploying

See [DEPLOY.md](DEPLOY.md) for Vercel (static frontend + serverless API functions, keys via
project environment variables).

## Design intent

The hard rule throughout: **the deterministic engine is the single source of truth for every
numerical result; the AI assists, explains, and drives the workspace, but never invents numbers.**
