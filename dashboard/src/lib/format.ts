/** Resolves a public-dir-relative path against the app's deployed base (GitHub Pages' /Machine/ in production). */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Coarse, honest "how long ago" for a real timestamp — never invents precision it doesn't have. */
export function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
