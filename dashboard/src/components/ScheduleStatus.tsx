import { useEffect, useState } from "react";
import { PIPELINE_WORKFLOW_FILE, REPO_SLUG } from "../lib/githubActions";
import { formatRelative } from "../lib/format";
import { PIPELINE_CRON_DESCRIPTION, formatCountdown, nextScheduledRunAt } from "../lib/schedule";

interface LastRunInfo {
  status: string;
  conclusion: string | null;
  created_at: string;
  html_url: string;
}

export function ScheduleStatus() {
  const [now, setNow] = useState(() => new Date());
  const [lastRun, setLastRun] = useState<LastRunInfo | null>(null);
  const [lastRunFailed, setLastRunFailed] = useState(false);

  // Countdown ticks off the local clock — no extra API calls needed for this part.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`https://api.github.com/repos/${REPO_SLUG}/actions/workflows/${PIPELINE_WORKFLOW_FILE}/runs?per_page=1`, {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`GitHub Actions runs fetch failed: ${res.status}`);
        return res.json();
      })
      .then((data: { workflow_runs: LastRunInfo[] }) => {
        if (cancelled) return;
        setLastRun(data.workflow_runs[0] ?? null);
      })
      .catch((err) => {
        console.error("Failed to fetch pipeline.yml's last run:", err);
        if (!cancelled) setLastRunFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const next = nextScheduledRunAt(now);

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-500">
      <span title={`Weekly cron: ${PIPELINE_CRON_DESCRIPTION} (.github/workflows/pipeline.yml)`}>
        Next scheduled run: {formatCountdown(next, now)} &middot; {next.toISOString().replace(/\.000Z$/, "Z")}
      </span>
      <span>
        Last run:{" "}
        {lastRun ? (
          <a href={lastRun.html_url} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-slate-300">
            {lastRun.conclusion ?? lastRun.status} &middot; {formatRelative(lastRun.created_at)}
          </a>
        ) : lastRunFailed ? (
          "unavailable"
        ) : (
          "loading…"
        )}
      </span>
      <span
        className="cursor-help text-slate-600"
        title="GitHub auto-disables scheduled workflows after 60 days with no repo activity — worth keeping an eye on."
      >
        (?)
      </span>
    </div>
  );
}
