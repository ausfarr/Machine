import { REPO_SLUG } from "./githubActions";
import { clearToken, getToken } from "./githubToken";

const CONTENTS_API_BASE = `https://api.github.com/repos/${REPO_SLUG}/contents`;

/** utf-8 <-> base64 helpers — GitHub's Contents API always speaks base64. */
function toBase64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}
function fromBase64(b64: string): string {
  return decodeURIComponent(escape(atob(b64)));
}

export interface ExistingFile {
  content: string;
  sha: string;
}

export type GithubWriteOutcome =
  | { kind: "success" }
  | { kind: "no-token" }
  | { kind: "auth-error"; message: string }
  | { kind: "error"; message: string };

/**
 * Fetches a repo file's current decoded content + blob sha via the
 * Contents API, so a caller can merge new data into it before writing
 * back. Returns null for a file that doesn't exist yet (a fresh write,
 * not an update). Throws only on an unexpected non-404 failure — 401/403
 * are surfaced to the caller so it can apply the same re-check-your-token
 * handling as writeFile below.
 */
export async function getFile(path: string, token: string): Promise<ExistingFile | null> {
  const res = await fetch(`${CONTENTS_API_BASE}/${path}?ref=main`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (res.status === 404) return null;
  if (res.status === 401 || res.status === 403) {
    const err = new Error(`GitHub rejected the token (${res.status}) fetching ${path}`);
    (err as Error & { authError?: boolean }).authError = true;
    throw err;
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch ${path} from GitHub: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { content: string; sha: string };
  return { content: fromBase64(data.content), sha: data.sha };
}

/**
 * GETs a file's current sha (if it exists), then PUTs the new content —
 * the write mechanics shared by the publish-status form and the KDP CSV
 * upload, rather than each rolling its own fetch logic. Applies the same
 * 401/403 handling established by TriggerPipelineButton: clear the saved
 * token and tell the caller to re-check it via GithubTokenSettings,
 * rather than failing silently.
 */
export async function commitFile(path: string, content: string, message: string): Promise<GithubWriteOutcome> {
  const token = getToken();
  if (!token) return { kind: "no-token" };

  try {
    const existing = await getFile(path, token);

    const res = await fetch(`${CONTENTS_API_BASE}/${path}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify({
        message,
        content: toBase64(content),
        branch: "main",
        ...(existing ? { sha: existing.sha } : {}),
      }),
    });

    if (res.status === 200 || res.status === 201) {
      return { kind: "success" };
    }
    if (res.status === 401 || res.status === 403) {
      clearToken();
      return {
        kind: "auth-error",
        message: "GitHub rejected the token (401/403) — it was cleared. Re-enter a valid token via the gear icon.",
      };
    }
    return { kind: "error", message: `GitHub responded ${res.status} ${res.statusText}` };
  } catch (err) {
    if (err instanceof Error && (err as Error & { authError?: boolean }).authError) {
      clearToken();
      return {
        kind: "auth-error",
        message: "GitHub rejected the token (401/403) — it was cleared. Re-enter a valid token via the gear icon.",
      };
    }
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
