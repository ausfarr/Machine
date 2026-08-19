/**
 * Literal cron schedule from .github/workflows/pipeline.yml's
 * `on.schedule.cron` — keep these in sync if that file changes.
 */
export const PIPELINE_CRON = "0 13 * * 1"; // Monday 13:00 UTC
export const PIPELINE_CRON_DESCRIPTION = "Mondays at 13:00 UTC";

/** Next Monday 13:00 UTC at or after `now`, per PIPELINE_CRON above. */
export function nextScheduledRunAt(now: Date = new Date()): Date {
  const candidate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 13, 0, 0, 0)
  );
  const day = candidate.getUTCDay(); // 0 = Sunday ... 1 = Monday
  let daysUntilMonday = (1 - day + 7) % 7;
  if (daysUntilMonday === 0 && candidate.getTime() <= now.getTime()) {
    daysUntilMonday = 7;
  }
  candidate.setUTCDate(candidate.getUTCDate() + daysUntilMonday);
  return candidate;
}

/** Coarse, honest countdown to a future timestamp — mirrors formatRelative's granularity, just forward-looking. */
export function formatCountdown(target: Date, now: Date = new Date()): string {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return "due now";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `in ~${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `in ~${hours}h`;
  const days = Math.round(hours / 24);
  return `in ~${days}d`;
}
