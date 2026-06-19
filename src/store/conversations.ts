// Local persistence for chat sessions ("designs"). Stored in localStorage so conversations,
// their messages, and the mechanism state survive reloads and can be reopened from the
// sidebar. No backend needed — appropriate for a single-user FYP tool.

import type { ChatMessage } from "../ai/types";
import type { FourBarLinkage, SliderCrankLinkage } from "../engine";
import type { MechanismKind } from "../state";

export interface ConversationSnapshot {
  kind: MechanismKind;
  fourbar: FourBarLinkage;
  slider: SliderCrankLinkage;
  viewMode: "2d" | "3d" | "cad";
  cadModel?: import("../cad/types").CadModel | null;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  modelId: string;
  messages: ChatMessage[];
  workspace: ConversationSnapshot;
}

const KEY = "macking-conversations-v1";

type Store = Record<string, Conversation>;

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function write(store: Store) {
  localStorage.setItem(KEY, JSON.stringify(store));
}

/** All conversations, newest activity first. */
export function loadConversations(): Conversation[] {
  return Object.values(read()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getConversation(id: string): Conversation | undefined {
  return read()[id];
}

export function saveConversation(c: Conversation) {
  const store = read();
  // Strip transient flags and heavy image data (base64 would blow the localStorage quota);
  // attachments are model context, not chat history we need to restore.
  const messages = c.messages.map(({ pending: _pending, attachments: _att, ...m }) => m);
  store[c.id] = { ...c, messages };
  try {
    write(store);
  } catch {
    /* quota exceeded — drop oldest and retry once */
    const sorted = Object.values(store).sort((a, b) => a.updatedAt - b.updatedAt);
    if (sorted.length > 1) {
      delete store[sorted[0].id];
      try {
        write(store);
      } catch {
        /* give up silently */
      }
    }
  }
}

export function deleteConversation(id: string) {
  const store = read();
  delete store[id];
  write(store);
}

export function newConversationId(): string {
  return crypto.randomUUID();
}

/** Derive a short title from the first user message. */
export function titleFrom(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 48 ? t.slice(0, 47) + "…" : t || "New chat";
}

export function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}
