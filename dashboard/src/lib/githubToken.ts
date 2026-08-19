/**
 * Stores a user-supplied fine-grained GitHub PAT in this browser only.
 * Never sent anywhere but api.github.com, never logged, never echoed back
 * in full once saved (see GithubTokenSettings.tsx).
 */
const STORAGE_KEY = "machine_dashboard_gh_token";
const CHANGE_EVENT = "machine-gh-token-changed";

function notifyChange(): void {
  // Guarded for the non-browser test environment (no jsdom/window there).
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token);
  notifyChange();
}

export function clearToken(): void {
  localStorage.removeItem(STORAGE_KEY);
  notifyChange();
}

/** Masked form for the "token saved" confirmation — never shows the full value again. */
export function maskToken(token: string): string {
  const tail = token.slice(-4);
  return `****${tail}`;
}

/** Lets other components (e.g. TriggerPipelineButton) react when GithubTokenSettings saves/clears the token, without lifting shared state up to App. */
export function onTokenChange(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}
