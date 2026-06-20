// Bring-Your-Own-Key storage. Keys live in localStorage and are sent to OUR proxy only
// (which forwards them to the provider). They are never committed or shown after entry.

import type { Provider } from "../../shared/models";

const STORE = "kincad-byok";

type KeyStore = Partial<Record<Provider, string>>;

export function getKeys(): KeyStore {
  try {
    return JSON.parse(localStorage.getItem(STORE) || "{}");
  } catch {
    return {};
  }
}

export function getKey(p: Provider): string | undefined {
  return getKeys()[p];
}

export function hasKey(p: Provider): boolean {
  return !!getKeys()[p];
}

export function setKey(p: Provider, value: string | null) {
  const s = getKeys();
  if (value && value.trim()) s[p] = value.trim();
  else delete s[p];
  localStorage.setItem(STORE, JSON.stringify(s));
}
