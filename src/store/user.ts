// First-run user profile (name + onboarding flag), persisted locally.

const KEY = "kincad-profile";

export interface Profile {
  name: string;
  onboarded: boolean;
}

export function loadProfile(): Profile {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "");
    if (p && typeof p.onboarded === "boolean") return { name: p.name ?? "", onboarded: p.onboarded };
  } catch {
    /* not set yet */
  }
  return { name: "", onboarded: false };
}

export function saveProfile(p: Profile) {
  localStorage.setItem(KEY, JSON.stringify(p));
}
