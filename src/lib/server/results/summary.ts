import type { AttemptInput } from '$lib/server/repositories/attempts';

export function summarizeAttempts(attempts: AttemptInput[]): Record<string, unknown> {
  const bySituation: Record<string, Record<string, unknown>> = {};
  for (const attempt of attempts) {
    const key = String(attempt.situationKey || '');
    if (!key) continue;
    const previous = bySituation[key] ?? {};
    const next: Record<string, unknown> = {
      ...previous,
      key,
      title: attempt.situationTitle || previous.title || '',
      attempts: Number(previous.attempts ?? 0) + 1,
      lastTs: attempt.ts,
    };
    if (
      attempt.phase === 1 &&
      Number.isFinite(Number(attempt.score)) &&
      Number.isFinite(Number(attempt.total))
    ) {
      const candidate = {
        score: Number(attempt.score),
        total: Number(attempt.total),
        triesUsed: Number(attempt.triesUsed ?? 0),
        timeElapsed: Number(attempt.timeElapsed ?? 0),
        ts: attempt.ts,
      };
      const best = previous.bestPhase1 as typeof candidate | undefined;
      if (
        !best ||
        candidate.score > best.score ||
        (candidate.score === best.score && candidate.triesUsed < best.triesUsed)
      ) {
        next.bestPhase1 = candidate;
      }
    }
    if (attempt.phase === 2 && (attempt.stage === 1 || attempt.stage === 2)) {
      next[attempt.stage === 2 ? 'lastPhase2Stage2' : 'lastPhase2Stage1'] = {
        success: Boolean(attempt.success),
        triesUsed: Number(attempt.triesUsed ?? 0),
        timeElapsed: Number(attempt.timeElapsed ?? 0),
        picked: attempt.picked ?? [],
        ts: attempt.ts,
      };
    }
    bySituation[key] = next;
  }
  return bySituation;
}
