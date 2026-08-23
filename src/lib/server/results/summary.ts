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
      lastOutcome: attempt.outcome
        ?? (attempt.success === true ? 'passed' : attempt.success === false ? 'failed' : null),
    };
    const phaseOne = attempt.phase1 ?? (
      attempt.phase === 1
        ? {
            ok: Number(attempt.score) >= Number(attempt.total),
            scoreCorrect: Number(attempt.score),
            scoreTotal: Number(attempt.total),
            triesUsed: Number(attempt.triesUsed ?? 0),
            elapsed: Number(attempt.timeElapsed ?? 0),
            completedAt: String(attempt.ts ?? ''),
          }
        : null
    );
    if (phaseOne && Number.isFinite(phaseOne.scoreCorrect) && Number.isFinite(phaseOne.scoreTotal)) {
      const candidate = {
        score: Number(phaseOne.scoreCorrect),
        total: Number(phaseOne.scoreTotal),
        triesUsed: Number(phaseOne.triesUsed ?? 0),
        timeElapsed: Number(phaseOne.elapsed ?? 0),
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
    const stages = attempt.sequenceStages?.length
      ? attempt.sequenceStages
      : attempt.phase === 2 && (attempt.stage === 1 || attempt.stage === 2)
        ? [{
            stage: attempt.stage,
            success: Boolean(attempt.sequenceSuccess ?? attempt.success),
            triesUsed: Number(attempt.triesUsed ?? 0),
            timeElapsed: Number(attempt.timeElapsed ?? 0),
            picked: (attempt.picked ?? []) as string[],
            expected: [],
            completedAt: String(attempt.ts ?? ''),
          }]
        : [];
    for (const stage of stages) {
      if (stage.stage !== 1 && stage.stage !== 2) continue;
      next[stage.stage === 2 ? 'lastPhase2Stage2' : 'lastPhase2Stage1'] = {
        success: Boolean(stage.success),
        triesUsed: Number(stage.triesUsed ?? 0),
        timeElapsed: Number(stage.timeElapsed ?? 0),
        picked: stage.picked ?? [],
        ts: attempt.ts,
      };
    }
    bySituation[key] = next;
  }
  return bySituation;
}
