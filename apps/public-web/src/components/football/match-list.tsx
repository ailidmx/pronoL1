"use client";

import type { FootballMatch } from "@/server/football-repository";
import { formatMatchDate, matchScore, matchStatusLabel } from "@/lib/football-format";
import { readConsent } from "@/lib/google/consent";
import { publicThemeExperiment } from "@/lib/experiments/registry";
import { ClubMark } from "./club-mark";
import { slugify } from "@/lib/slug";
import styles from "./match-list.module.scss";

const visitorStorageKey = "prono-l1-visitor-id-v1";

function captureMatchDetailOpened(matchId: string) {
  if (!publicThemeExperiment.enabled || readConsent()?.analytics !== "granted") return;
  const distinctId = localStorage.getItem(visitorStorageKey);
  const variant = window.__PRONO_EXPERIMENTS__?.[publicThemeExperiment.key];
  if (!distinctId || !variant) return;
  void fetch("/api/analytics/event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      event: "match_detail_opened",
      distinctId,
      properties: {
        experiment: publicThemeExperiment.key,
        variant,
        matchId,
        [`$feature/${publicThemeExperiment.key}`]: variant,
      },
    }),
  }).catch(() => undefined);
}

export function MatchList({ matches, linked = true }: { matches: FootballMatch[]; linked?: boolean }) {
  if (matches.length === 0) return <p className="empty-state">Aucun match disponible.</p>;

  return (
    <div className="match-list">
      {matches.map((match) => (
        <article className="match-row" key={match.id}>
          <div className="match-meta">
            <time dateTime={match.date ?? undefined}>{formatMatchDate(match.date)}</time>
            <span>{matchStatusLabel(match.status)}</span>
          </div>
          <div className={`${styles.scoreline} match-teams`}>
            <div className={styles.team}>
              <ClubMark club={match.homeClub} />
            </div>
            <strong className={styles.score}>{matchScore(match)}</strong>
            <div className={styles.team}>
              <ClubMark club={match.awayClub} />
            </div>
          </div>
          {linked ? (
            <a
              className="match-detail-link"
              href={`/match/${match.id}/${slugify(`${match.homeClub.name}-${match.awayClub.name}`)}`}
              onClick={() => captureMatchDetailOpened(match.id)}
            >
              Fiche du match <span aria-hidden="true">→</span>
            </a>
          ) : null}
        </article>
      ))}
    </div>
  );
}
