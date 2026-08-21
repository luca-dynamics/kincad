// First-run user profile (name + onboarding flag + agent preferences), persisted locally.

const KEY = "kincad-profile";

export interface Profile {
  name: string;
  onboarded: boolean;
  /**
   * When true the agent's workspace changes land immediately; when false they arrive as a
   * proposal the user must Apply or Discard. Required, not optional, so a place that rebuilds
   * a profile from scratch rather than spreading the old one fails to compile.
   */
  autoApply: boolean;
}

export function loadProfile(): Profile {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "");
    // `=== true` rather than a truthiness test: a profile stored before this preference existed
    // has no such key, and reading that absence as "approval required" is the safe migration.
    if (p && typeof p.onboarded === "boolean")
      return { name: p.name ?? "", onboarded: p.onboarded, autoApply: p.autoApply === true };
  } catch {
    /* not set yet */
  }
  return { name: "", onboarded: false, autoApply: false };
}

export function saveProfile(p: Profile) {
  localStorage.setItem(KEY, JSON.stringify(p));
}
