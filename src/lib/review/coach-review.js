const positions = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
const validPoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const safePositions = source => Object.fromEntries(positions.filter(id => validPoint(source?.[id])).map(id => [id, source[id]]));

// Replay only captured checkpoints. Never substitute today's situation data.
export function buildReviewFrames(attempt) {
  const frames = [];
  let current = safePositions(attempt.initialPositions);
  if (Object.keys(current).length) frames.push({ label: 'Starting positions', positions: current });
  for (const [index, check] of (Array.isArray(attempt.phase1Checks) ? attempt.phase1Checks : []).entries()) {
    current = safePositions(check.positions);
    frames.push({ label: `Position check ${index + 1}`, positions: current, score: `${check.scoreCorrect ?? '—'}/${check.scoreTotal ?? '—'}`, at: check.checkedAt });
  }
  if (!frames.length) {
    current = safePositions(attempt.finalPositions);
    if (Object.keys(current).length) frames.push({ label: 'Final recorded positions', positions: current });
  }
  const checks = Array.isArray(attempt.sequenceChecks) && attempt.sequenceChecks.length
    ? attempt.sequenceChecks : (Array.isArray(attempt.sequenceStages) ? attempt.sequenceStages : []);
  for (const [index, check] of checks.entries()) {
    const picked = Array.isArray(check.picked) ? check.picked : [];
    const expected = Array.isArray(check.expected) ? check.expected : [];
    for (let step = 0; step < Math.max(1, picked.length); step++) {
      frames.push({ label: `Sequence ${check.stage ?? 1} · check ${index + 1} · step ${step + 1}`, positions: current,
        picked: picked.slice(0, step + 1), expected, success: check.success, at: check.checkedAt || check.completedAt });
    }
  }
  return frames;
}

export function openCoachReview(attempt, fieldSource, bases = {}) {
  document.getElementById('coachAttemptReview')?.close();
  const frames = buildReviewFrames(attempt);
  const snapshot = attempt.situationSnapshot || {};
  const runnerNumbers = window._diqOffenseNumbers?.(snapshot.key || attempt.situationKey || 'review') || {batter:10,first:20,second:30,third:40};
  const dialog = document.createElement('dialog');
  dialog.id = 'coachAttemptReview';
  dialog.className = 'coach-attempt-review';
  dialog.setAttribute('aria-labelledby', 'attemptReviewTitle');
  // All record content is inserted through textContent below.
  dialog.innerHTML = `<div class="attempt-review-heading"><div><span class="eyebrow">Coach review</span><h2 id="attemptReviewTitle"></h2><p class="attempt-identity"></p></div><button type="button" data-close>Close review</button></div>
    <div class="attempt-review-layout"><div><div class="attempt-review-field"><img alt="Recorded attempt field"><svg viewBox="0 0 3200 2133" role="img" aria-label="Recorded defender positions and selected throws"></svg></div><p class="attempt-review-legend">Navy: recorded defenders · dashed white: expected targets · gold numbered chips: starting runners (illustrative numbers) · brass line: selected throws</p></div>
    <aside class="attempt-review-details"><h3>Attempt result</h3><p data-result></p><dl><dt>Position score</dt><dd data-score></dd><dt>Tries used</dt><dd data-tries></dd><dt>Positioning time</dt><dd data-time></dd><dt>Situation conditions</dt><dd data-conditions></dd></dl><h3 data-frame></h3><p data-check-score></p><p data-date></p><h3>Play sequence</h3><p data-picked></p><p data-expected></p><p data-sequence-result></p><p data-availability></p></aside></div>
    <div class="attempt-playback"><button type="button" data-previous aria-label="Previous recorded step">Previous</button><button type="button" data-play>Play</button><button type="button" data-next aria-label="Next recorded step">Next</button><label>Recorded step <input type="range" min="0" value="0" step="1"></label><output aria-live="polite"></output><label>Speed <select><option value="1500">1×</option><option value="750">2×</option></select></label></div><p class="attempt-playback-note">Playback shows saved checkpoints, not a continuous recording of player movement.</p>`;
  const find = selector => dialog.querySelector(selector);
  const set = (selector, value) => { find(selector).textContent = String(value ?? '—'); };
  set('#attemptReviewTitle', attempt.situationTitle || snapshot.title || 'Recorded attempt');
  set('.attempt-identity', [attempt.playerName, attempt.playerNumber ? `#${attempt.playerNumber}` : '', attempt.completedAt || attempt.startedAt || attempt.createdAt].filter(Boolean).join(' · '));
  set('[data-result]', attempt.lifecycleStatus === 'incomplete' ? 'In progress' : (attempt.outcome || (attempt.success === true ? 'passed' : attempt.success === false ? 'failed' : 'Not recorded')));
  set('[data-score]', `${attempt.phase1?.scoreCorrect ?? attempt.phase1ScoreCorrect ?? attempt.score ?? '—'}/${attempt.phase1?.scoreTotal ?? attempt.phase1ScoreTotal ?? attempt.total ?? '—'}`);
  set('[data-tries]', attempt.phase1?.triesUsed ?? attempt.phase1TriesUsed ?? (attempt.phase === 1 ? attempt.triesUsed : '—'));
  const elapsed = attempt.phase1?.elapsed ?? attempt.phase1Elapsed ?? (attempt.phase === 1 ? attempt.timeElapsed : null);
  set('[data-time]', elapsed == null ? 'Not recorded' : `${elapsed}s`);
  set('[data-conditions]', snapshot.runnersOn ? `${snapshot.outs ?? '—'} outs · Runners: ${Object.entries(snapshot.runnersOn).filter(([, on]) => on).map(([base]) => base).join(', ') || 'none'}` : 'Not recorded');
  const targets = safePositions(snapshot.targets);
  set('[data-availability]', !frames.length ? 'This older attempt has no recorded positions or sequence checkpoints. Summary only.' : !Object.keys(targets).length ? 'Expected target coordinates were not saved for this attempt.' : 'Expected targets use the situation saved with this attempt.');
  find('img').src = fieldSource;
  const svg = find('svg');
  const node = (tag, attributes, text) => {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    if (text != null) element.textContent = text;
    svg.appendChild(element);
    return element;
  };
  let index = 0, timer = null;
  const pause = () => { clearTimeout(timer); timer = null; set('[data-play]', 'Play'); };
  const render = () => {
    const frame = frames[index];
    svg.replaceChildren();
    for (const [id, point] of Object.entries(targets)) {
      node('circle', { cx: point.x, cy: point.y, r: Number.isFinite(point.tol) ? Math.max(12, point.tol) : 65, class: 'review-target' });
      node('text', { x: point.x, y: point.y - 78, class: 'review-target-label' }, id);
    }
    for (const base of ['first', 'second', 'third']) {
      const point = bases[base];
      if (snapshot.runnersOn?.[base] && validPoint(point)) {
        const next = bases[{first:'second',second:'third',third:'home'}[base]];
        const x = validPoint(next) ? point.x + (next.x-point.x)*.14 - (next.y-point.y)*.06 : point.x;
        const y = validPoint(next) ? point.y + (next.y-point.y)*.14 + (next.x-point.x)*.06 : point.y;
        node('circle', {cx:x,cy:y,r:32,class:'review-starting-runner'});
        node('text', {x,y,class:'review-runner-number'},runnerNumbers[base]);
      }
    }
    if (validPoint(snapshot.hit)) node('circle', { cx: snapshot.hit.x, cy: snapshot.hit.y, r: 15, class: 'review-hit' });
    const picks = frame?.picked || [];
    for (let i = 1; i < picks.length; i++) {
      const from = frame.positions[picks[i - 1]], to = frame.positions[picks[i]];
      if (from && to) node('line', { x1: from.x, y1: from.y, x2: to.x, y2: to.y, class: 'review-throw' });
    }
    for (const [id, point] of Object.entries(frame?.positions || {})) {
      node('circle', { cx: point.x, cy: point.y, r: 40.5, class: `review-defender${picks.at(-1) === id ? ' is-selected' : ''}` });
      node('text', { x: point.x, y: point.y + 11, class: 'review-position-label' }, id);
    }
    set('[data-frame]', frame?.label || 'Summary');
    set('[data-check-score]', frame?.score ? `Check score: ${frame.score}` : '');
    set('[data-date]', frame?.at ? `Recorded: ${frame.at}` : '');
    const selected = frame?.picked || (Array.isArray(attempt.picked) ? attempt.picked : []);
    const expected = frame?.expected || (Array.isArray(snapshot.playSeq) ? snapshot.playSeq : []);
    set('[data-picked]', `Selected: ${selected.join(' → ') || 'Not recorded'}`);
    set('[data-expected]', `Expected: ${expected.join(' → ') || 'Not recorded'}`);
    set('[data-sequence-result]', frame?.success == null ? '' : `Recorded check: ${frame.success ? 'Correct' : 'Incorrect'}`);
    find('input').value = String(index);
    find('input').setAttribute('aria-valuetext', frame?.label || 'No recorded steps');
    set('output', frames.length ? `${index + 1} / ${frames.length}` : 'No recorded steps');
    find('[data-previous]').disabled = index === 0;
    find('[data-next]').disabled = index >= frames.length - 1;
  };
  const tick = () => {
    timer = setTimeout(() => { if (!dialog.open) return pause(); index++; render(); if (index >= frames.length - 1) pause(); else tick(); }, Number(find('select').value));
  };
  find('[data-close]').onclick = () => dialog.close();
  find('[data-previous]').onclick = () => { pause(); index = Math.max(0, index - 1); render(); };
  find('[data-next]').onclick = () => { pause(); index = Math.min(frames.length - 1, index + 1); render(); };
  find('[data-play]').disabled = frames.length < 2;
  find('[data-play]').onclick = () => { if (timer) return pause(); if (index === frames.length - 1) index = 0; render(); set('[data-play]', 'Pause'); tick(); };
  find('input').max = String(Math.max(0, frames.length - 1));
  find('input').disabled = frames.length < 2;
  find('input').oninput = event => { pause(); index = Number(event.target.value); render(); };
  const previousFocus = document.activeElement;
  dialog.addEventListener('close', () => { pause(); dialog.remove(); if (previousFocus?.isConnected) previousFocus.focus(); }, { once: true });
  document.body.appendChild(dialog);
  render();
  dialog.showModal();
  find('[data-close]').focus();
}
