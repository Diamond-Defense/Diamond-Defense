/// @diq:begin [A0.1] App state (mutable)
let SITUATIONS = [];
let SITUATIONS_ORIG_BY_KEY = {};

let currentSituation = null;

let startsMap = {};
let hitsMap   = {};

let gameActive = false;
let remainingTries = 0;
const MAX_TRIES = 3;

let _allTargetsCorrect = false;

// Phase 1 (chip placement) summary for the most recently completed round
let _phase1Summary = null; // { ok:boolean, triesUsed:number, elapsed:number, ts:number }

let coachUnlocked = false;
let situationEditorRole = null;

// Situation Builder edit history (Undo/Redo, per-situation; 10-step)
const SB_HISTORY_MAX = 10;
let sbHistKey = null;         // currentSituation.key the stacks apply to
let sbUndoStack = [];         // array of snapshots
let sbRedoStack = [];
let _sbTolStartSnap = null;   // snapshot captured at start of tol edits
let _sbNotesStartSnap = null; // snapshot captured at start of notes edits

let runnerEl = null;
let runnerAnimId = null;
let runnerLastBase = 'home';

let imgRect={width:1,height:1,left:0,top:0};
let CHIP_PX = 36;

let ballSvg=null, ballPath=null, ballEl=null, hitMarker=null;
let animReq=null;

let liveRunners = { first:false, second:false, third:false };
let _animSuppressedBases = new Set();

let _wired = false;

let _roundHasStarted = false;

let phase2Active = false;
let seqOrder = [];     // array of POS_IDS e.g. ['LF','SS','2B','C']
let seqIndex = 0;      // current expected index
let _phase2Ended = false;   // prevents target panel from showing after Phase 2

const PHASE2_MAX_TRIES = 3;
let phase2TriesLeft = 0;
let allowSeqPanel = false;
let phase2Picks = [];
let phase2Stage = 1; // 1 = primary playSeq, 2 = optional secondary playSeq2         // array of POS_IDS in the order the user picked
let verifySeqBtn = null;      // created in wireOnce
let phase2Locked = new Set(); // chips locked as correct prefix (GLOBAL)

const Bus = (() => {
  /** @type {Record<string, Set<Function>>} */ const map = {};
  return {
    on(evt, fn){ (map[evt] ||= new Set()).add(fn); return () => map[evt].delete(fn); },
    off(evt, fn){ map[evt]?.delete(fn); },
    emit(evt, payload){ map[evt]?.forEach(fn => { try{ fn(payload); } catch{} }); }
  };
})();

let _currentSelectedTargetId = null;

/// @diq:begin [A0.2] DOM refs
const img=document.getElementById('fieldImg');
const wrap=document.getElementById('wrap');
const targetsLayer=document.getElementById('targetsLayer');
const ballLayer=document.getElementById('ballLayer');

const sitSelect=document.getElementById('sitSelect');
const randomSitBtn = document.getElementById('randomSitBtn');
const startBtn=document.getElementById('startBtn');
const resetBtn=document.getElementById('resetBtn');
const checkBtn=document.getElementById('checkBtn');
const scoreVal=document.getElementById('scoreVal');
const triesVal=document.getElementById('triesVal');
const triesBadge = document.getElementById('triesBadge');
const scoreBadge = document.getElementById('scoreBadge');
const descHud = document.getElementById('descHud');

const tolNotes = document.getElementById('tolNotes');

const targetPanel      = document.getElementById('targetPanel');
const targetPanelTitle = document.getElementById('targetPanelTitle');
const targetPanelBody  = document.getElementById('targetPanelBody');
const fieldNotice      = document.getElementById('fieldNotice');
const playbookRail     = document.getElementById('playbookRail');

const continueBtn = document.getElementById('continueBtn');
const seqPanel    = document.getElementById('seqPanel');
const seqBody     = document.getElementById('seqBody');
const seqInput    = document.getElementById('seqInput');
const seqNoteInput = document.getElementById('seqNoteInput');

/* Play Sequence Builder refs */
const seqSubsec      = document.getElementById('seqSubsec');
const seqPosGrid     = document.getElementById('seqPosGrid');
const seqList        = document.getElementById('seqList');
const seqTemplateSel = document.getElementById('seqTemplateSel');
const seqClearBtn    = document.getElementById('seqClearBtn');
const seqCountHud    = document.getElementById('seqCountHud');

const timerBadge = document.getElementById('timerBadge');
const timerVal   = document.getElementById('timerVal');
const gameLoginGate = document.getElementById('gameLoginGate');
const gameLoginGateBtn = document.getElementById('gameLoginGateBtn');

const coachBtn=document.getElementById('coachBtn');

function hasGameAccess(){
  return Boolean(window.__DIQ_AUTH_USER__?.id);
}

function applyGameAccess(){
  const allowed = hasGameAccess();
  const fieldCard = document.querySelector('.field-card');
  fieldCard?.classList.toggle('is-login-required', !allowed);
  wrap?.setAttribute('aria-disabled', String(!allowed));
  gameLoginGate?.classList.toggle('hidden', allowed);
  if(randomSitBtn) randomSitBtn.disabled = !allowed;
  if(sitSelect) sitSelect.disabled = !allowed;

  if(!allowed){
    if(gameActive || _roundHasStarted) resetPlayers();
    if(startBtn) startBtn.disabled = true;
    if(resetBtn) resetBtn.disabled = true;
    if(checkBtn) checkBtn.disabled = true;
    if(continueBtn) continueBtn.disabled = true;
    if(verifySeqBtn) verifySeqBtn.disabled = true;
    setChipsLocked(true);
  }else{
    if(startBtn && !gameActive && !_roundHasStarted) startBtn.disabled = false;
    if(continueBtn) continueBtn.disabled = false;
    if(verifySeqBtn) verifySeqBtn.disabled = false;
  }
}

window._diqApplyGameAccess = applyGameAccess;

function closeGuideRail(){
  playbookRail?.classList.remove('is-open');
  document.getElementById('playbookToggle')?.setAttribute('aria-expanded', 'false');
}
// Ensure header groups exist and move elements into them for consistent layout

const ensureHeaderGrouping = () => {
  const header = document.querySelector('header');
  if (!header) return;

  let shell = header.querySelector('.header-shell');
  if (!shell) {
    shell = document.createElement('div');
    shell.className = 'header-shell';
    header.appendChild(shell);
  }

  const ensureGroup = (className, parent) => {
    let group = shell.querySelector(`.${className}`);
    if (!group) {
      group = document.createElement('div');
      group.className = className;
      parent.appendChild(group);
    }
    return group;
  };

  const primary = ensureGroup('header-primary', shell);
  const brand = ensureGroup('brand-area', primary);
  const accountActions = ensureGroup('account-actions', primary);
  const toolbar = ensureGroup('game-toolbar', shell);
  const situationControls = ensureGroup('situation-controls', toolbar);
  const gameControls = ensureGroup('game-controls', toolbar);
  const statusStrip = ensureGroup('status-strip', toolbar);
  const contextBar = document.getElementById('contextBar');
  if (contextBar && contextBar.parentElement !== shell) shell.appendChild(contextBar);

  let toolsDrawer = document.getElementById('toolsDrawer');
  if (!toolsDrawer) {
    toolsDrawer = document.createElement('aside');
    toolsDrawer.id = 'toolsDrawer';
    toolsDrawer.className = 'tools-drawer';
    toolsDrawer.setAttribute('aria-label', 'Coach and admin tools');
    document.querySelector('.app')?.appendChild(toolsDrawer);
  }
  [document.getElementById('coachCard'), document.getElementById('adminCard')]
    .forEach(card => { if (card && card.parentElement !== toolsDrawer) toolsDrawer.appendChild(card); });

  if (!brand.querySelector('.brand-mark')) {
    const mark = document.createElement('span');
    mark.className = 'brand-mark';
    mark.setAttribute('aria-hidden', 'true');
    const icon = document.createElement('img');
    icon.alt = '';
    icon.decoding = 'async';
    icon.src = document.querySelector('link[data-diamond-defense-icon]')?.href || './diamond-defense-app-icon.png';
    mark.appendChild(icon);
    brand.appendChild(mark);
  }

  let brandCopy = brand.querySelector('.brand-copy');
  if (!brandCopy) {
    brandCopy = document.createElement('span');
    brandCopy.className = 'brand-copy';
    brand.appendChild(brandCopy);
  }

  const h1 = header.querySelector('h1');
  if (h1) {
    h1.textContent = 'Diamond Defense';
    brandCopy.appendChild(h1);
  }
  if (!brandCopy.querySelector('.brand-tagline')) {
    const tagline = document.createElement('span');
    tagline.className = 'brand-tagline';
    tagline.textContent = 'Baseball situation simulator';
    brandCopy.appendChild(tagline);
  }
  if (!brandCopy.querySelector('.brand-descriptor')) {
    const descriptor = document.createElement('span');
    descriptor.className = 'brand-descriptor';
    descriptor.textContent = 'Interactive Playbook Trainer';
    brandCopy.appendChild(descriptor);
  }

  [
    document.getElementById('randomSitBtn'),
    document.getElementById('sitSelect'),
    document.getElementById('descHud'),
  ].forEach(el => { if (el) situationControls.appendChild(el); });

  [
    document.getElementById('startBtn'),
    document.getElementById('resetBtn'),
    document.getElementById('checkBtn'),
    document.getElementById('continueBtn'),
    document.getElementById('verifySeqBtn'),
  ].forEach(el => { if (el) gameControls.appendChild(el); });

  [
    document.getElementById('runnersBadge'),
    document.getElementById('outsHud'),
    document.getElementById('hud'),
  ].forEach(el => { if (el) statusStrip.appendChild(el); });

  const playerButton = document.getElementById('playerBtn');
  if (playerButton) accountActions.appendChild(playerButton);

  let playbookToggle = document.getElementById('playbookToggle');
  if (!playbookToggle) {
    playbookToggle = document.createElement('button');
    playbookToggle.id = 'playbookToggle';
    playbookToggle.className = 'btn-slate playbook-toggle';
    playbookToggle.type = 'button';
    playbookToggle.textContent = 'Guide';
    playbookToggle.setAttribute('aria-label', 'Guide');
    playbookToggle.setAttribute('aria-controls', 'playbookRail');
    playbookToggle.setAttribute('aria-expanded', 'false');
    accountActions.appendChild(playbookToggle);
  }

  let staffToolsButton = document.getElementById('staffToolsBtn');
  if (!staffToolsButton) {
    staffToolsButton = document.createElement('button');
    staffToolsButton.id = 'staffToolsBtn';
    staffToolsButton.className = 'btn-slate hidden';
    staffToolsButton.type = 'button';
    staffToolsButton.textContent = 'Tools';
    staffToolsButton.setAttribute('aria-controls', 'toolsDrawer');
    accountActions.appendChild(staffToolsButton);
  }
  let legacyRoleActions = accountActions.querySelector('.legacy-role-actions');
  if (!legacyRoleActions) {
    legacyRoleActions = document.createElement('div');
    legacyRoleActions.className = 'legacy-role-actions hidden';
    legacyRoleActions.setAttribute('aria-hidden', 'true');
    accountActions.appendChild(legacyRoleActions);
  }
  [document.getElementById('coachBtn'), document.getElementById('adminBtn')]
    .forEach(el => { if (el) legacyRoleActions.appendChild(el); });
  if (staffToolsButton.dataset.wired !== '1') {
    staffToolsButton.dataset.wired = '1';
    staffToolsButton.addEventListener('click', () => {
      const role = window.__DIQ_AUTH_USER__?.role;
      if (role === 'coach') document.getElementById('coachBtn')?.click();
      else if (role === 'admin') document.getElementById('adminBtn')?.click();
    });
  }
  window._diqUpdateAuthNavigation?.();

  const closePlaybook = () => {
    closeGuideRail();
  };
  if (playbookToggle.dataset.wired !== '1') {
    playbookToggle.dataset.wired = '1';
    playbookToggle.addEventListener('click', () => {
      const open = !playbookRail?.classList.contains('is-open');
      if (open) {
        document.querySelector('#coachCard:not(.hidden) #coachCardCloseBtn')?.click();
        document.querySelector('#adminCard:not(.hidden) #adminCardCloseBtn')?.click();
      }
      playbookRail?.classList.toggle('is-open', open);
      playbookToggle.setAttribute('aria-expanded', String(open));
    });
  }
  const playbookClose = document.getElementById('playbookClose');
  if (playbookClose && playbookClose.dataset.wired !== '1') {
    playbookClose.dataset.wired = '1';
    playbookClose.addEventListener('click', closePlaybook);
  }

  const contextBarClose = document.getElementById('contextBarClose');
  if (contextBarClose && contextBarClose.dataset.wired !== '1') {
    contextBarClose.dataset.wired = '1';
    contextBarClose.addEventListener('click', () => {
      hideTargetPanel?.();
      hideSeqPanel?.();
    });
  }

  const legacyActions = header.querySelector(':scope > .header-actions');
  if (legacyActions && !legacyActions.children.length) legacyActions.remove();
};

function openPlaybookRail(){
  playbookRail?.classList.add('is-open');
  document.getElementById('playbookToggle')?.setAttribute('aria-expanded', 'true');
}

function updateShellMetrics(){
  const header = document.querySelector('header');
  if (!header) return;
  document.documentElement.style.setProperty('--app-header-height', `${Math.ceil(header.getBoundingClientRect().height)}px`);
}

let _headerResizeObserver = null;
function observeHeader(){
  updateShellMetrics();
  if (!window.ResizeObserver) return;
  try{
    _headerResizeObserver?.disconnect();
    _headerResizeObserver = new ResizeObserver(() => {
      updateShellMetrics();
      scheduleLayout();
    });
    _headerResizeObserver.observe(document.querySelector('header'));
  }catch{}
}


const coachCard=document.getElementById('coachCard');
const coachStatus=document.getElementById('coachStatus');

const tolTargetSel=document.getElementById('tolTargetSel');
const tolNum=document.getElementById('tolNum');
const tolRange=document.getElementById('tolRange');

function selectTolTarget(id, opts = {}){
  if(!id || !tolTargetSel) return;
  tolTargetSel.value = id;
  tolTargetSel.dispatchEvent(new Event('change', { bubbles:true }));
  if(opts && opts.focusNotes && tolNotes){
    try{ tolNotes.focus(); }catch(e){}
  }
}

const hitTypeSel=document.getElementById('hitTypeSel');
const testHitBtn=document.getElementById('testHitBtn');
const advanceSel=document.getElementById('advanceSel');

const downloadCurrentBtn=document.getElementById('downloadCurrentBtn');
const downloadAllBtn=document.getElementById('downloadAllBtn');

const pwModal=document.getElementById('pwModal');
const pwInput=document.getElementById('pwInput');
const pwOk=document.getElementById('pwOk');
const pwCancel=document.getElementById('pwCancel');
const pwMsg=document.getElementById('pwMsg');
const coachLoginTeamSelect=document.getElementById('coachLoginTeamSelect');
const coachLoginNameSelect=document.getElementById('coachLoginNameSelect');

const newTitleInput   = document.getElementById('newTitleInput');
const newDescInput    = document.getElementById('newDescInput');
const newSituationBtn  = document.getElementById('newSituationBtn');
const saveSituationBtn = document.getElementById('saveSituationBtn');
const deleteSituationBtn = document.getElementById('deleteSituationBtn');
const resetStartsBtn = document.getElementById('resetStartsBtn');
const sbUndoBtn = document.getElementById('sbUndoBtn');
const sbRedoBtn = document.getElementById('sbRedoBtn');
const situationMsg     = document.getElementById('situationMsg');

const outsValHud      = document.getElementById('outsVal');
const outsSelSituation = document.getElementById('outsSelSituation');
const runnersValHud   = document.getElementById('runnersVal');

const run1B = document.getElementById('run1B');
const run2B = document.getElementById('run2B');
const run3B = document.getElementById('run3B');

/// @diq:begin [A0.3] Geometry & scaling (deduped)
function unitToCss(native){ return { left:native.x*(imgRect.width/IMG_W), top:native.y*(imgRect.height/IMG_H) }; }
function cssToUnit(left,top){ return { x:left*(IMG_W/imgRect.width), y:top*(IMG_H/imgRect.height) }; }
function nativeToCssPoint(pt){ const css=unitToCss(pt); return { x:css.left, y:css.top }; }

function updateChipScale(){
  const base = Math.min(imgRect.width, imgRect.height);
  const size = clamp(Math.round(base * 0.045), 22, 38);
  CHIP_PX = size;
  const fz = clamp(Math.round(size * 0.40), 10, 14);
  wrap.style.setProperty('--chip-size', size + 'px');
  wrap.style.setProperty('--chip-font', fz + 'px');
}

function tolToCssDiameter(tol, allowTiny=false){
  const s = Math.min(imgRect.width / IMG_W, imgRect.height / IMG_H);
  const dCss = 2 * tol * s;
  if (allowTiny) return Math.max(6, Math.round(dCss));
  const minByChip = CHIP_PX * 1.8;
  return Math.round(Math.max(dCss, minByChip));
}

// @diq:end [A0]
/// @diq:begin [A1] Resize & Layout (single source of truth)
/* schedule layout on next frame (avoid resize jank) */
let _resizeRaf = null;
function scheduleLayout(){
  if (_resizeRaf) cancelAnimationFrame(_resizeRaf);
  _resizeRaf = requestAnimationFrame(() => {
    _resizeRaf = null;
    sizeOverlays();
  });
}

/* observe #wrap — reacts to container changes, not just window resize */
let _wrapResizeObserver = null;
function observeWrap(){
  if (!window.ResizeObserver || !wrap) return;
  try{
    if (_wrapResizeObserver) _wrapResizeObserver.disconnect();
    _wrapResizeObserver = new ResizeObserver(() => scheduleLayout());
    _wrapResizeObserver.observe(wrap);
  }catch{}
}

/* global listeners */
window.addEventListener('resize', scheduleLayout);
window.addEventListener('orientationchange', scheduleLayout);

window.addEventListener('resize', updateDescriptionHudText);
window.addEventListener('orientationchange', updateDescriptionHudText);

// @diq:end [A1]
/// @diq:begin [A2] Marker Scaling (single copy)
// Increased starting sizes; still scale down/up responsively
const BASE_MARKER_SIZES = {
  ball:40,
  runner:50,      // animated batter
  baseRunner:50,  // static on-base runners
  hit:40
};

function uiScale(){
  return Math.min(imgRect.width / IMG_W, imgRect.height / IMG_H);
}

function getBallStrokeWidth(){
  const s = uiScale();
  return clamp(Math.round(3 * s * 1.1), 2, 6);
}

function scaleMarkers(){
  const s = uiScale();
  const sizePx = (base, min=8, max=28) => clamp(Math.round(base * s), min, max);

  wrap.querySelectorAll('.runner .rlabel, .baseRunner .rlabel').forEach(el=>{
    const s = uiScale();
    el.style.fontSize = clamp(Math.round(13 * s * 1.05), 11, 18) + 'px';
  });

  // Ball
  if (ballEl){
    const d = sizePx(BASE_MARKER_SIZES.ball, 8, 26);
    ballEl.style.width  = d + 'px';
    ballEl.style.height = d + 'px';
    const outline = clamp(Math.round(2 * s), 1, 3);
    const drop    = clamp(Math.round(3 * s), 1, 4);
    ballEl.style.boxShadow = `0 0 0 ${outline}px #000, 0 1px ${drop}px rgba(0,0,0,.35)`;
  }

  // Animated batter
  if (runnerEl){
    const d = sizePx(BASE_MARKER_SIZES.runner, 8, 24);
    runnerEl.style.width  = d + 'px';
    runnerEl.style.height = d + 'px';
  }

  // Static + moving base runners
  if (wrap){
    wrap.querySelectorAll('.baseRunner, .movingRunner').forEach(el=>{
      const d = sizePx(BASE_MARKER_SIZES.baseRunner, 12, 48);
      el.style.width  = d + 'px';
      el.style.height = d + 'px';
    });
  }

  if (hitMarker){
    const d = sizePx(BASE_MARKER_SIZES.hit, 10, 28);
    hitMarker.style.width  = d + 'px';
    hitMarker.style.height = d + 'px';
  }
}

// @diq:end [A2]
/// @diq:begin [A3] Chips (tokens) — core drag/drop
/* Token registry: id -> { el, pos:{x,y} } */
const tokens = new Map();

/* Remove any existing chips */
function clearChips(){
  if (!wrap) return;
  wrap.querySelectorAll('.chip').forEach(n=>n.remove());
  tokens.clear();
}

/* Build 9 draggable chips and place them at the current situation starts */
function buildTokens(){
  clearChips();

  const sKey = (currentSituation && currentSituation.key) || (SITUATIONS[0] && SITUATIONS[0].key);

  POS_IDS.forEach(id=>{
    const el=document.createElement('div');

    const group = (['P','C'].includes(id) ? 'Battery'
                 : (['1B','2B','SS','3B'].includes(id) ? 'Infield' : 'Outfield'));

    el.className = `chip ${group}`;
    el.textContent = id;
    wrap.appendChild(el);

    // pick a start from saved map (if any), else DEFAULT_STARTS
    const start = sKey ? getStartFor(sKey,id) : DEFAULT_STARTS[id];

    tokens.set(id, { el, pos: Fcopy(start) });
    placeToken(id);
    makeChipDraggable(el,id);
  });
}

/* Position a single chip according to its native pos -> CSS px */
function placeToken(id){
  const rec = tokens.get(id);
  if (!rec || !rec.pos || !rec.el) return;   // safe if buildTokens hasn't run yet
  const css = unitToCss(rec.pos);
  rec.el.style.left = css.left + 'px';
  rec.el.style.top  = css.top  + 'px';
}

/* Can the user drag chips right now? */
function canDrag(){
  return coachUnlocked || (gameActive && remainingTries > 0);
}

/* Basic pointer-driven dragging (writes native coords back to tokens map) */
function makeChipDraggable(el,id){
  let drag=null;
  let preSnap=null;

  // --- drag for Phase 1 / coach ---
  el.addEventListener('pointerdown', e=>{
    if (!canDrag()) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);

    // Situation Builder history: capture pre-edit snapshot (coach only)
    if (coachUnlocked && currentSituation) { try{ preSnap = sbSnapshot(); }catch(err){ preSnap=null; } }

    const rec = tokens.get(id);
    const css = unitToCss(rec.pos);

    drag = { cx:e.clientX, cy:e.clientY, left:css.left, top:css.top };

    const onMove = (e2)=>{
      if (!drag) return;
      const left = drag.left + (e2.clientX - drag.cx);
      const top  = drag.top  + (e2.clientY - drag.cy);
      el.style.left = left + 'px';
      el.style.top  = top  + 'px';
      const native = cssToUnit(left, top);
      tokens.get(id).pos = { x: native.x, y: native.y };
    };

    const onUp = ()=>{
      window.removeEventListener('pointermove', onMove);

      // Persist coach-edited starts for this situation and record undo step
      if (coachUnlocked && currentSituation){
        try{
          const starts = getOnscreenStarts();
          startsMap[currentSituation.key] = Fcopy(starts);
          currentSituation.starts = Fcopy(starts);
          saveStarts();
        }catch(e){}
        try{ if(preSnap) sbPushUndo(preSnap); }catch(e){}
        preSnap = null;
      }

      drag = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once:true });
  });

  el.addEventListener('click', ()=>{
    if (!phase2Active) return;
    if (!seqOrder || !seqOrder.length) return;

    // Don’t allow toggling locked (already-correct) chips
    if (phase2Locked.has(id)) return;

    const idx = phase2Picks.indexOf(id);

    if (idx === -1){
      // ✅ Allow selecting beyond required count; verification will fail if length mismatches
      phase2Picks.push(id);
      setChipPickIndex(el, phase2Picks.length);
    } else {
      // Deselect this chip and renumber visible badges
      phase2Picks.splice(idx, 1);
      clearChipPickMarker(el);
      rerenderPickMarkers();
    }

    // Keep the Play Sequence panel hidden until success/exhaustion
    hideSeqPanel();
  });

}

// @diq:end [A3]
/// @diq:begin [A4] Targets (rings)
function getRingEl(id){ return wrap.querySelector(`.tgt[data-id="${id}"]`); }
function getAllRings(){ return Array.from(wrap.querySelectorAll('.tgt')); }
function buildTargets(){
  getAllRings().forEach(n=>n.remove());
  const t=currentSituation.targets||{};
  Object.entries(t).forEach(([id,pt])=>{
    const ring=document.createElement('div');
    ring.className='tgt'; ring.dataset.id = id;
    const css=unitToCss(pt);
    ring.style.left=css.left+'px'; ring.style.top =css.top +'px';
    const label=document.createElement('span');
    label.className='tgt-label'; label.textContent=id;
    ring.appendChild(label);
    const tol = Number(pt.tol) || DEFAULT_TOL;
    const dpx = tolToCssDiameter(tol, coachUnlocked);
    ring.style.width  = dpx + 'px';
    ring.style.height = dpx + 'px';
    if (coachUnlocked){
      ring.style.display='block';
      ring.classList.add('show-label','draggable'); ring.classList.remove('locked');
      makeTargetDraggable(ring,id);

      // Coach convenience: click a ring to select it in Targets & Tolerance dropdown
      ring.addEventListener('click', (e)=>{
        if(!coachUnlocked) return;
        e.stopPropagation();
        selectTolTarget(id);
      });
    } else {
      ring.style.display='none';
      ring.classList.remove('show-label','draggable'); ring.classList.add('locked');
    }
    wrap.appendChild(ring);
  });
}
function makeTargetDraggable(el,id){
  let drag=null;
  let preSnap=null;
  el.addEventListener('pointerdown',e=>{
    if(!coachUnlocked) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    drag={cx:e.clientX,cy:e.clientY,left:parseFloat(el.style.left),top:parseFloat(el.style.top)};

    if (coachUnlocked && currentSituation) { try{ preSnap = sbSnapshot(); }catch(err){ preSnap=null; } }
    window.addEventListener('pointermove',onMove);
    window.addEventListener('pointerup',onUp,{once:true});
  });
  function onMove(e){
    if(!drag) return;
    const left=drag.left+(e.clientX-drag.cx);
    const top =drag.top +(e.clientY-drag.cy);
    el.style.left=left+'px'; el.style.top=top+'px';
    const pt=cssToUnit(left,top);
    setTargetFor(currentSituation.key,id,pt,currentSituation.targets?.[id]?.tol ?? DEFAULT_TOL);
  }
  function onUp(){
    window.removeEventListener('pointermove',onMove);
    try{ if(preSnap) sbPushUndo(preSnap); }catch(e){}
    preSnap=null;
    drag=null;
  }
}

function renderTargetPanel(id){
  if (!targetPanel || !targetPanelTitle || !targetPanelBody) return;
  _currentSelectedTargetId = id;

  targetPanel.classList.remove('hidden');
  targetPanelTitle.textContent = `Position Notes: ${id}`;

  const notes = getTargetNotes(currentSituation.key, id);
  targetPanelBody.innerHTML = notes
    ? `<div>${String(notes).replace(/\n/g, '<br>')}</div>`
    : `<div class="hint">No notes for ${id}</div>`;
  targetPanelBody.classList.remove('show-instruction');
  hideFieldNotice();
}

let _fieldNoticeTimer = null;
function showFieldNotice(message = 'Select a target ring to view its coaching notes.'){
  if (!fieldNotice) return;
  if (_fieldNoticeTimer) clearTimeout(_fieldNoticeTimer);
  fieldNotice.textContent = message;
  fieldNotice.classList.remove('hidden');
  requestAnimationFrame(() => fieldNotice.classList.add('is-visible'));
  _fieldNoticeTimer = setTimeout(hideFieldNotice, 6500);
}

function hideFieldNotice(){
  if (!fieldNotice) return;
  if (_fieldNoticeTimer) clearTimeout(_fieldNoticeTimer);
  _fieldNoticeTimer = null;
  fieldNotice.classList.remove('is-visible');
  setTimeout(() => {
    if (!fieldNotice.classList.contains('is-visible')) fieldNotice.classList.add('hidden');
  }, 180);
}

function showTargetInstruction(){
  if (!targetPanel || !targetPanelTitle || !targetPanelBody) return;
  _currentSelectedTargetId = null;
  targetPanel.classList.add('hidden');
  targetPanelBody.classList.remove('show-instruction');
  showFieldNotice();
}

/** Enable click-to-select for rings (used only after last try) */
function enableTargetSelection(){
  getAllRings().forEach(ring=>{
    ring.classList.add('selectable');           // visual affordance
    ring.addEventListener('click', onRingClick);
  });

  // Always show the instruction card when selection turns on (non-coach)
  if (isPostRound()) {
    if (typeof showTargetInstruction === 'function') {
      showTargetInstruction();                  // ← ensures "Select a target ring..." is visible now
    } else if (typeof showTargetPanel === 'function') {
      showTargetPanel();
    }
  }
}

/** Disable click-to-select for rings and forget the current selection */
function disableTargetSelection(){
  getAllRings().forEach(ring=>{
    ring.classList.remove('selectable');
    ring.removeEventListener('click', onRingClick);
  });
  _currentSelectedTargetId = null;
}

/** Click handler for a ring; shows panel only when game is over (non-coach mode) */
function onRingClick(e){
  if (isPostRound()){
    const id = e.currentTarget?.dataset?.id;
    if (id) {
      renderTargetPanel(id);
    }
  }
}

/** Panel visibility helpers */
function showTargetPanel(){ if (targetPanel) targetPanel.classList.remove('hidden'); }
function hideTargetPanel(){ if (targetPanel) targetPanel.classList.add('hidden'); }

// @diq:end [A4]
/// @diq:begin [A5] Runners & Outs
function normalizeRunnersOn(obj){ const src=obj||{}; return { first:!!src.first, second:!!src.second, third:!!src.third }; }
function runnersStateToArray(r){ const out=[]; if(r.first)out.push('1B'); if(r.second)out.push('2B'); if(r.third)out.push('3B'); return out; }
function getRunnersFromCheckboxes(){ return { first:!!(run1B&&run1B.checked), second:!!(run2B&&run2B.checked), third:!!(run3B&&run3B.checked) }; }
function updateRunnersHudFromLive(){
  if (!runnersValHud) return;
  // Show the runners defined by the situation (static), not the live/animated state
  const baseSource = (currentSituation && currentSituation.runnersOn)
    ? normalizeRunnersOn(currentSituation.runnersOn)
    : normalizeRunnersOn(liveRunners);
  const arr = runnersStateToArray(baseSource);
  runnersValHud.textContent = arr.length ? arr.join(',') : '—';
}
function setRunnersOn(next,{quiet=true}={}){
  if (!currentSituation) return;
  const newState = next ? normalizeRunnersOn(next) : normalizeRunnersOn(getRunnersFromCheckboxes());
  currentSituation.runnersOn = { ...newState };
  if (!gameActive) liveRunners = { ...newState };
  if (run1B&&run2B&&run3B){ run1B.checked=!!newState.first; run2B.checked=!!newState.second; run3B.checked=!!newState.third; }
  updateRunnersHudFromLive();
  renderBaseRunners();
  scaleMarkers();
  if (!quiet && situationMsg){ situationMsg.textContent='Runners updated'; setTimeout(()=>situationMsg.textContent='',900); }
  if(coachUnlocked) queueCurrentSituationDatabaseSync();
}
function setOuts(value,{quiet=true}={}){
  if (!currentSituation) return;
  const v = clampInt(value,0,2);
  currentSituation.outs = v;
  if (outsValHud) outsValHud.textContent = String(v);
  if (outsSelSituation && outsSelSituation.value !== String(v)) outsSelSituation.value = String(v);
  if (!quiet && situationMsg){ situationMsg.textContent='Outs updated'; setTimeout(()=>{situationMsg.textContent='';},900); }
  if(coachUnlocked) queueCurrentSituationDatabaseSync();
}
/* draw/remove base runners  */
function renderBaseRunners(state, exclude = new Set()){
  // Merge explicit excludes + global suppression
  const blocked = new Set([...exclude, ..._animSuppressedBases]);

  // Only remove static dots; keep animated movers alive
  if (wrap) wrap.querySelectorAll('.baseRunner:not(.movingRunner)').forEach(n=>n.remove());

  const r = state ? normalizeRunnersOn(state) : normalizeRunnersOn(liveRunners);

  const add=(baseName)=>{
    if (blocked.has(baseName)) return; // skip bases we’re animating
    const pos=BASES_NATIVE[baseName]; if(!pos||!wrap) return;
    const m=document.createElement('div');
    m.className='baseRunner';
    m.dataset.base = baseName;
    const css=unitToCss(pos);
    m.style.left=css.left+'px';
    m.style.top =css.top +'px';
    wrap.appendChild(m);
  };

  if (r.first)  add('first');
  if (r.second) add('second');
  if (r.third)  add('third');

  if (typeof scaleMarkers === 'function') scaleMarkers();
}
function advanceRunnersState(state,bases){
  bases = clampInt(bases,0,3);
  const r = normalizeRunnersOn(state);
  if (bases<=0) return {...r};
  const occ=[]; if(r.first)occ.push(1); if(r.second)occ.push(2); if(r.third)occ.push(3);
  occ.sort((a,b)=>b-a);
  const dest={1:false,2:false,3:false};
  for(const b of occ){ const nb=b+bases; if (nb<4) dest[nb]=true; }
  return { first:!!dest[1], second:!!dest[2], third:!!dest[3] };
}

// @diq:end [A5]
/// @diq:begin [A6] Ball & Hit
function buildBallGraphics(){
  ballLayer.innerHTML = '';
  const svgNS='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(svgNS,'svg');
  svg.setAttribute('viewBox',`0 0 ${imgRect.width} ${imgRect.height}`);
  ballSvg=svg; ballLayer.appendChild(svg);
  if (!ballEl){
    ballEl=document.createElement('div');
    ballEl.className='ball'; ballEl.style.display='none';
    wrap.appendChild(ballEl);
    makeBallDraggable(ballEl);
  }
  syncBallToHit();
}
function ensureDefaultHit(){
  if (!currentSituation) return;
  if (!currentSituation.hit || isNaN(currentSituation.hit.x) || isNaN(currentSituation.hit.y)){
    currentSituation.hit = { x:1600, y:700 };
  }
}
function syncBallToHit(){
  if (!ballEl || !currentSituation) return;
  ensureDefaultHit();
  const css=unitToCss(currentSituation.hit);
  ballEl.style.left=css.left+'px'; ballEl.style.top=css.top+'px';
  ballEl.style.display = (coachUnlocked || gameActive || phase2Active) ? 'block' : 'none';
  ballEl.classList.toggle('locked', !coachUnlocked);
}
function makeBallDraggable(el){
  let drag=null;
  el.addEventListener('pointerdown',e=>{
    if (!coachUnlocked) return;
    e.preventDefault(); el.setPointerCapture(e.pointerId);
    drag={cx:e.clientX,cy:e.clientY,left:parseFloat(el.style.left)||0, top:parseFloat(el.style.top)||0};
    window.addEventListener('pointermove',onMove);
    window.addEventListener('pointerup',onUp,{once:true});
  });
  function onMove(e){
    if(!drag) return;
    const left=drag.left+(e.clientX-drag.cx), top=drag.top+(e.clientY-drag.cy);
    el.style.left=left+'px'; el.style.top=top+'px';
    const pt=cssToUnit(left,top);
    if(currentSituation) currentSituation.hit={ x:Math.round(pt.x), y:Math.round(pt.y) };
  }
  function onUp(){ window.removeEventListener('pointermove',onMove); drag=null; }
}
function placeHitMarker(){
  if (hitMarker){ hitMarker.remove(); hitMarker=null; }
  if (!coachUnlocked) return;
  ensureDefaultHit();
  const css=unitToCss(currentSituation.hit);
  hitMarker=document.createElement('div');
  hitMarker.className='hitTarget'; hitMarker.style.left=css.left+'px'; hitMarker.style.top=css.top+'px';
  wrap.appendChild(hitMarker); makeHitMarkerDraggable(hitMarker);
}
function makeHitMarkerDraggable(el){
  let drag=null;
  el.addEventListener('pointerdown',e=>{
    if (!coachUnlocked) return;
    e.preventDefault(); el.setPointerCapture(e.pointerId);
    drag={cx:e.clientX,cy:e.clientY,left:parseFloat(el.style.left),top:parseFloat(el.style.top)};
    window.addEventListener('pointermove',onMove);
    window.addEventListener('pointerup',onUp,{once:true});
  });
  function onMove(e){
    if(!drag) return;
    const left=drag.left+(e.clientX-drag.cx), top=drag.top+(e.clientY-drag.cy);
    el.style.left=left+'px'; el.style.top=top+'px';
    const pt=cssToUnit(left,top);
    currentSituation.hit={ x:Math.round(pt.x), y:Math.round(pt.y) };
    syncBallToHit();
  }
  function onUp(){ window.removeEventListener('pointermove',onMove); drag=null; }
}
function mapHitTypeToAdvance(hitType){
  switch((hitType||'').toLowerCase()){
    case 'grounder': return 1;
    case 'line':     return 2;
    case 'popup':    return 0;
    default:         return 1;
  }
}
function animateHit(style){
  const sit=currentSituation; if(!sit) return;
  ensureDefaultHit(); style = style || sit.hitType || 'line';
  if (ballSvg) ballSvg.innerHTML='';
  const startCss=nativeToCssPoint(HOME_NATIVE), endCss=nativeToCssPoint(sit.hit);
  const svgNS='http://www.w3.org/2000/svg';

  // Popup path controls (used for both the blue line + the moving ball so it always follows the line)
  let popupC1=null, popupC2=null;

  if (style==='line' || style==='grounder'){
    ballPath=document.createElementNS(svgNS,'line');
    Object.entries({x1:startCss.x,y1:startCss.y,x2:endCss.x,y2:endCss.y}).forEach(([k,v])=>ballPath.setAttribute(k,v));
    ballPath.setAttribute('stroke','#59e7ff');
    ballPath.setAttribute('stroke-width', String(getBallStrokeWidth()));
    if (style==='grounder') ballPath.setAttribute('stroke-dasharray','8 8');
    ballSvg.appendChild(ballPath);
  } else {
    // Cubic bezier gives a nice high arch while allowing a gentler "descent" near the end.
    const distLocal=Math.hypot(endCss.x-startCss.x,endCss.y-startCss.y);
    const archH=clamp(distLocal*0.70, 180, 420); // higher arch
    const dx=endCss.x-startCss.x, dy=endCss.y-startCss.y;

    // Peak earlier + reduce lift near landing so there's less arch at the very end.
    popupC1={ x:startCss.x + dx*0.35, y:startCss.y + dy*0.35 - archH };
    popupC2={ x:startCss.x + dx*0.78, y:startCss.y + dy*0.78 - archH*0.25 };

    const d=`M ${startCss.x},${startCss.y} C ${popupC1.x},${popupC1.y} ${popupC2.x},${popupC2.y} ${endCss.x},${endCss.y}`;
    ballPath=document.createElementNS(svgNS,'path');
    ballPath.setAttribute('d',d); ballPath.setAttribute('fill','none');
    ballPath.setAttribute('stroke','#59e7ff');
    ballPath.setAttribute('stroke-width', String(getBallStrokeWidth()));
    ballSvg.appendChild(ballPath);
  }

  ballEl.style.left=`${startCss.x}px`; ballEl.style.top=`${startCss.y}px`; ballEl.style.display='block';
  const dist=Math.hypot(endCss.x-startCss.x,endCss.y-startCss.y);
  const duration = clamp(1200 + dist * 0.90, 1500, 3200); // slower + smoother
  let t0=performance.now(); if (animReq) cancelAnimationFrame(animReq);
  const p0={x:startCss.x,y:startCss.y}, p3={x:endCss.x,y:endCss.y};

  function cubicPoint(a,b,c,d,t){
    const mt=1-t, mt2=mt*mt, t2=t*t;
    const w0=mt2*mt, w1=3*mt2*t, w2=3*mt*t2, w3=t2*t;
    return { x:w0*a.x + w1*b.x + w2*c.x + w3*d.x,
             y:w0*a.y + w1*b.y + w2*c.y + w3*d.y };
  }

  function step(now){
    const t=clamp((now-t0)/duration,0,1);

    // For popup: ease-in-out to simulate "hang time" while still tracking the same blue line path.
    const u=(style==='popup')?(0.5-0.5*Math.cos(Math.PI*t)):t;

    const pos=(style==='popup' && popupC1 && popupC2)
      ? cubicPoint(p0,popupC1,popupC2,p3,u)
      : {x:lerp(p0.x,p3.x,t), y:lerp(p0.y,p3.y,t)};

    ballEl.style.left=`${pos.x}px`; ballEl.style.top=`${pos.y}px`;
    if (t<1) animReq=requestAnimationFrame(step);
    else { if (ballSvg) ballSvg.innerHTML=''; animReq=null; if (ballEl) ballEl.style.display='block'; }
  }
  animReq=requestAnimationFrame(step);
}
function ensureRunner(){
  if (!runnerEl){
    runnerEl = document.createElement('div');
    runnerEl.className = 'runner';
    runnerEl.style.display = 'none';

    // Add label element inside (counter-rotated via CSS)
    const lab = document.createElement('span');
    lab.className = 'rlabel';
    lab.textContent = 'B'; // Batter when moving
    runnerEl.appendChild(lab);

    wrap.appendChild(runnerEl);
  }
}
function placeRunnerAtBase(base){
  ensureRunner();
  runnerLastBase = base;

  const pt = BASES_NATIVE[base] || BASES_NATIVE.home;
  const css = unitToCss(pt);

  runnerEl.style.left = css.left + 'px';
  runnerEl.style.top  = css.top  + 'px';
  runnerEl.style.display = 'block';

  // Label B1/B2/B3 on base; hide on home
  const lab = runnerEl.querySelector('.rlabel');
  if (lab){
    lab.textContent =
      base === 'first'  ? 'B1' :
      base === 'second' ? 'B2' :
      base === 'third'  ? 'B3' : 'B';
  }
}
function hideRunner(){ if (runnerEl) runnerEl.style.display='none'; runnerLastBase='home'; }
function animateBatterAdvance(basesAdvanced, onDone){
  ensureRunner();
  if (runnerAnimId){ cancelAnimationFrame(runnerAnimId); runnerAnimId=null; }

  // Normalize + clamp
  basesAdvanced = clampInt(basesAdvanced, 0, 4);

  // If OUT (0 bases), show a short run toward 1B and stop (to visualize the throw-out)
  if (basesAdvanced === 0){
    const fromCss = nativeToCssPoint(BASES_NATIVE['home']);
    const toCss   = nativeToCssPoint(BASES_NATIVE['first']);

    // Place runner at home to start
    runnerEl.style.left = fromCss.x + 'px';
    runnerEl.style.top  = fromCss.y + 'px';
    runnerEl.style.display = 'block';
    runnerLastBase = 'home';

    // Stop ~80% of the way to 1B (tweak if you want)
    const stopT = 0.80;
    const midX  = lerp(fromCss.x, toCss.x, stopT);
    const midY  = lerp(fromCss.y, toCss.y, stopT);

    const dist = Math.hypot(toCss.x - fromCss.x, toCss.y - fromCss.y) * stopT;
    const duration = clamp(700 + dist * 0.55, 600, 1400);

    let t0 = performance.now();
    const step = (now) => {
      const t = clamp((now - t0) / duration, 0, 1);
      const e = 1 - Math.pow(1 - t, 3); // ease-out
      runnerEl.style.left = lerp(fromCss.x, midX, e) + 'px';
      runnerEl.style.top  = lerp(fromCss.y, midY, e) + 'px';
      runnerEl.style.display = 'block';
      if (t < 1){
        runnerAnimId = requestAnimationFrame(step);
      } else {
        // Stays visible short of 1B; not credited as reaching first
        runnerLastBase = 'home'; // keep model as not-on-base
        if (typeof onDone === 'function') onDone('home');
      }
    };
    runnerAnimId = requestAnimationFrame(step);
    return;
  }

  // Path of bases (index is "bases moved")
  const path=['home','first','second','third','home'];
  const legs=path.slice(0, Math.min(4,basesAdvanced)+1);

  placeRunnerAtBase(legs[0]);
  let legIdx=0;

  const runLeg=()=>{
    if (legIdx>=legs.length-1){
      // Finished
      const destBase = legs[legs.length-1];      // first/second/third/home
      runnerLastBase = destBase;
      if (typeof onDone === 'function') onDone(destBase);
      return;
    }
    const fromName=legs[legIdx], toName=legs[legIdx+1];
    const fromCss=nativeToCssPoint(BASES_NATIVE[fromName]);
    const toCss  =nativeToCssPoint(BASES_NATIVE[toName]);
    const dist=Math.hypot(toCss.x-fromCss.x,toCss.y-fromCss.y);
    const duration=clamp(700+dist*0.55, 800, 1600);

    let t0=performance.now();
    const step=(now)=>{
      const t=clamp((now-t0)/duration,0,1);
      const e=1-Math.pow(1-t,3);
      runnerEl.style.left=lerp(fromCss.x,toCss.x,e)+'px';
      runnerEl.style.top =lerp(fromCss.y,toCss.y,e)+'px';
      runnerEl.style.display='block';
      if (t<1) runnerAnimId=requestAnimationFrame(step);
      else { runnerLastBase=toName; legIdx++; runLeg(); }
    };
    runnerAnimId=requestAnimationFrame(step);
  };
  runLeg();
}

const BASE_ORDER = ['first', 'second', 'third', 'home'];

/**
 * Animate a runner that starts on a base (first/second/third) forward `advance` bases.
 * Returns a Promise that resolves when this runner's animation finishes.
 */
function animateExistingRunnerFrom(baseName, advance){
  return new Promise(resolve=>{
    // Nothing to do
    const startIdx = BASE_ORDER.indexOf(baseName);
    if (startIdx < 0 || advance <= 0) return resolve();

    // Remove the static dot for this base so we don't double-draw
    const toRemove = wrap.querySelector(`.baseRunner[data-base="${baseName}"]`);
    if (toRemove) toRemove.remove();

    // Create a moving element (reuse .baseRunner styling)
    const mover = document.createElement('div');
    mover.className = 'movingRunner';
    mover.style.position = 'absolute';
    mover.style.transform = 'translate(-50%,-50%)';
    wrap.appendChild(mover);

    // Let it scale like other markers
    if (typeof scaleMarkers === 'function') scaleMarkers();

    // Build its path across legs
    const destIdx = Math.min(startIdx + advance, BASE_ORDER.length - 1); // up to "home"
    const legs = BASE_ORDER.slice(startIdx, destIdx + 1); // e.g. ['first','second','third'] (or 'home')

    // Place at starting base
    const startCss = nativeToCssPoint(BASES_NATIVE[legs[0]]);
    mover.style.left = startCss.x + 'px';
    mover.style.top  = startCss.y + 'px';
    mover.style.display = 'block';

    let leg = 0, animId=null;

    const runLeg = ()=>{
      if (leg >= legs.length - 1){
        // If finished on "home", remove; otherwise we’ll later redraw statically via renderBaseRunners
        if (mover && mover.parentNode) mover.remove();
        return resolve();
      }
      const fromName = legs[leg];
      const toName   = legs[leg + 1];
      const fromCss  = nativeToCssPoint(BASES_NATIVE[fromName]);
      const toCss    = nativeToCssPoint(BASES_NATIVE[toName]);
      const dist     = Math.hypot(toCss.x - fromCss.x, toCss.y - fromCss.y);

      // Match your slower, smooth feel
      const duration = clamp(700 + dist * 0.55, 800, 1600);

      let t0 = performance.now();
      const step = (now)=>{
        const t = clamp((now - t0) / duration, 0, 1);
        const e = 1 - Math.pow(1 - t, 3); // smooth ease-out
        mover.style.left = lerp(fromCss.x, toCss.x, e) + 'px';
        mover.style.top  = lerp(fromCss.y, toCss.y, e) + 'px';
        if (t < 1) animId = requestAnimationFrame(step);
        else { leg++; runLeg(); }
      };
      animId = requestAnimationFrame(step);
    };

    runLeg();
  });
}

/**
 * Animate all existing runners (first/second/third) forward `advance` bases in parallel.
 * Calls onDone(finalState) when all have finished (finalState excludes batter).
 */
function animateExistingRunnersAdvance(advance, onDone){
  const start = normalizeRunnersOn(liveRunners);

  const movers = [];
  if (start.first)  movers.push('first');
  if (start.second) movers.push('second');
  if (start.third)  movers.push('third');

  if (movers.length === 0){
    const finalState = advanceRunnersState(start, advance);
    if (typeof onDone === 'function') onDone(finalState);
    return;
  }

  // Suppress the starting bases for movers (no static dot while they run)
  movers.forEach(b => _animSuppressedBases.add(b));

  // Initial paint while suppressed (so their start dots disappear immediately)
  renderBaseRunners(start);

  // Animate all movers
  Promise.all(movers.map(b => animateExistingRunnerFrom(b, advance)))
    .then(()=>{
      // Compute final state and clear suppression
      const finalState = advanceRunnersState(start, advance);
      movers.forEach(b => _animSuppressedBases.delete(b));

      // Repaint final positions (no ghosts)
      renderBaseRunners(finalState);

      if (typeof onDone === 'function') onDone(finalState);
    });
}

// @diq:end [A6]
/// @diq:begin [A7] Coach tools & visibility
// Staff credentials are verified by the database API; there is no browser fallback.
const CALIB_PASSWORD = '';
function applyCoachVisibility(){
  coachCard.classList.toggle('hidden', !(coachUnlocked && situationEditorRole === 'coach'));
  getAllRings().forEach(el=> el.style.display = coachUnlocked ? 'block' : 'none');

  // Single-ball model in coach mode: remove the orange hit marker if present
  if (hitMarker){ hitMarker.remove(); hitMarker = null; }

  // Always show the white ball; draggable when coach is unlocked
  if (ballEl){
    ballEl.style.display = (coachUnlocked || gameActive) ? 'block' : 'none';
    ballEl.classList.toggle('locked', !coachUnlocked);  // unlocked in coach mode
    ballEl.style.zIndex = '10';                         // keep on top of runners/chips
  }

  syncBallToHit();
}

function setChipsLocked(locked){ tokens.forEach(({el})=> el.classList.toggle('locked', locked && !coachUnlocked)); }
function updateHud(scoreCount){
  // --- helper: "Score: <b><span id='scoreVal'>n</span>/<den></b>" ---
  function setScoreDisplay(n, den){
    if (scoreVal) scoreVal.textContent = String(n);
    if (scoreBadge){
      const b = scoreBadge.querySelector('b');
      if (!b) return;
      const sv = b.querySelector('#scoreVal');
      if (!sv) return;

      // ensure the text node immediately after #scoreVal is "/<den>"
      let node = sv.nextSibling;
      if (!node || node.nodeType !== Node.TEXT_NODE){
        while (node){ const next = node.nextSibling; b.removeChild(node); node = next; }
        b.appendChild(document.createTextNode('/' + den));
      } else {
        node.textContent = '/' + den;
      }
    }
  }

  // --- Phase 2 visibility rule for SCORE (hide for players) ---
  const hideScoreForPhase2 = (phase2Active && !coachUnlocked);
  if (scoreBadge) scoreBadge.style.display = hideScoreForPhase2 ? 'none' : '';

  if (!hideScoreForPhase2){
    // Show score in Phase 1 (9 positions) OR in Coach mode during Phase 2
    if (phase2Active){
      // Coach can see Phase 2 progress (consecutive-correct prefix)
      const total = Array.isArray(seqOrder) ? seqOrder.length : 0;
      const good  = (typeof getPhase2ConsecutiveCorrect === 'function')
        ? getPhase2ConsecutiveCorrect()
        : 0;
      setScoreDisplay(good, total);

      if (scoreBadge){
        const pct = total ? (good / total) : 0;
        const state = pct >= 2/3 ? 'green' : (pct >= 1/3 ? 'yellow' : 'red');
        setBadgeState(scoreBadge, state, 'score');
      }
    } else {
      // Phase 1 score (0..9)
      const n = (typeof scoreCount === 'number') ? scoreCount : (Number(scoreVal?.textContent) || 0);
      setScoreDisplay(n, 9);
      if (scoreBadge){
        const pct = n / 9;
        const state = pct >= 2/3 ? 'green' : (pct >= 1/3 ? 'yellow' : 'red');
        setBadgeState(scoreBadge, state, 'score');
      }
    }
  }

  // --- Tries HUD (unchanged semantics) ---
  let triesLabel = '';
  let triesState = 'green';

  if (coachUnlocked) {
    triesLabel = '∞';
  } else if (phase2Active) {
    const t = Math.max(0, phase2TriesLeft);
    triesLabel = `${t}/${PHASE2_MAX_TRIES}`;
    triesState = (t >= 2) ? 'green' : (t === 1 ? 'yellow' : 'red');
  } else {
    const t = gameActive ? remainingTries : MAX_TRIES;
    triesLabel = `${t}/${MAX_TRIES}`;
    triesState = (t >= 2) ? 'green' : (t === 1 ? 'yellow' : 'red');
  }

  if (triesVal) triesVal.textContent = triesLabel;
  if (triesBadge) setBadgeState(triesBadge, triesState, 'tries');
}

function setBadgeState(el, state /* 'green'|'yellow'|'red' */, base){
  if (!el) return;
  el.classList.remove(`${base}-green`, `${base}-yellow`, `${base}-red`);
  el.classList.add(`${base}-${state}`);
}

function setCoachMode(enabled, options={}){
  coachUnlocked = !!enabled;
  situationEditorRole = coachUnlocked ? (options.role || 'coach') : null;
  if (coachUnlocked) {
    closeGuideRail();
    if(situationEditorRole !== 'admin') window._diqSetAdminMode?.(false);
  }
  coachStatus.textContent = coachUnlocked ? 'unlocked' : 'locked';
  coachStatus.style.color = coachUnlocked ? '#16a34a' : '#64748b';

  // Ensure Coach Tools panel is only visible when unlocked
  if (typeof coachCard !== 'undefined' && coachCard){
    if (coachUnlocked && situationEditorRole === 'coach') coachCard.classList.remove('hidden');
    else coachCard.classList.add('hidden');
  }

  if (coachUnlocked) setChipsLocked(false); else setChipsLocked(!gameActive || remainingTries===0);
  buildTargets(); applyCoachVisibility(); updateHud(Number(scoreVal.textContent)||0);
  disableTargetSelection();
  hideTargetPanel();
  void window._diqAbandonCurrentPlayAttempt?.('tools_opened');
  wipePhase2StateUI();
  if (continueBtn) continueBtn.classList.add('hidden');

}
window._diqSetEditorMode = (role)=>setCoachMode(Boolean(role), { role:role || 'coach' });
function openPwModal(){
  window._diqOpenAuthModal?.('coach');
  pwMsg.textContent='';
  pwInput.value='';
  void window._diqPrepareCoachLogin?.();
  setTimeout(()=>coachLoginTeamSelect?.focus(), 0);
}
function closePwModal(){ window._diqCloseAuthModal?.(); }
async function tryUnlock(){
  const teamId = String(coachLoginTeamSelect?.value || '');
  const coachId = String(coachLoginNameSelect?.value || '');
  if(!teamId || !coachId){
    pwMsg.textContent='Select your team and coach account.';
    return;
  }
  const valid = typeof window._diqAuthenticateCoach === 'function'
    ? await window._diqAuthenticateCoach(teamId, coachId, pwInput.value)
    : false;
  if(valid === null){
    pwMsg.textContent='Login service is temporarily unavailable. Please try again.';
    return;
  }
  if(valid){
    closePwModal();
    window._diqUpdateAuthNavigation?.();
  }else{
    pwMsg.textContent='Incorrect password.';
  }
}

// @diq:end [A7]
/// @diq:begin [A8] Situations I/O & helpers
/** @param {any} sRaw @param {number} i @returns {Situation} */
function normalizeSituation(sRaw, i){
  const safe = { ...(sRaw||{}) };
  safe.key   = String(safe.key||'').trim() || `S${i+1}`;
  safe.title = safe.title || safe.key;
  safe.desc  = safe.desc  || '';

  // geometry
  safe.targets = normalizeTargets(safe.targets)||{};
  safe.starts  = normalizeStarts(safe.starts);

  // hit + meta
  safe.hit     = normalizeHit(safe.hit);
  safe.hitType = mapHitType(safe.hitType);
  const advJSON = (typeof safe.batterAdvance==='number') ? clampInt(safe.batterAdvance,0,4) : null;
  safe.batterAdvance = (advJSON!=null) ? advJSON : mapHitTypeToAdvance(safe.hitType);

  // countables
  safe.outs = clampInt((safe.outs ?? 0), 0, 2);

  // runners
  safe.runnersOn = normalizeRunnersOn(safe.runnersOn);

  // Phase 2: sequence + note
  const rawSeq = Array.isArray(safe.playSeq) ? safe.playSeq : String(safe.playSeq || '')
                    .split(',')
                    .map(s => s.toUpperCase().trim())
                    .filter(Boolean);
  safe.playSeq = rawSeq.filter(s => POS_IDS.includes(s));
  safe.seqNote = (typeof safe.seqNote === 'string') ? safe.seqNote : '';

  return /** @type {Situation} */ (safe);
}

function defaultStartsMap(){
  const map = {};
  (SITUATIONS||[]).forEach(s=>{ map[s.key] = s.starts ? Fcopy(s.starts) : Fcopy(DEFAULT_STARTS); });
  return map;
}
function loadStarts(){
  startsMap = defaultStartsMap();
}
function saveStarts(){
  queueCurrentSituationDatabaseSync();
}
function getStartFor(sKey,id){ const s = startsMap[sKey] || DEFAULT_STARTS; return s[id] || DEFAULT_STARTS[id]; }
function setStartFor(sKey,id,pt){ if(!startsMap[sKey]) startsMap[sKey]=Fcopy(DEFAULT_STARTS); startsMap[sKey][id]={x:pt.x,y:pt.y}; }

function loadHits(){
  hitsMap = {};
  (SITUATIONS || []).forEach(s=>{
    if(s && s.key && s.hit && Number.isFinite(s.hit.x) && Number.isFinite(s.hit.y)){
      hitsMap[s.key] = { x:Math.round(s.hit.x), y:Math.round(s.hit.y) };
    }
  });
}
function saveHits(){
  queueCurrentSituationDatabaseSync();
}
function getHitSaved(sKey){ const v=hitsMap[sKey]; return (v && !isNaN(v.x) && !isNaN(v.y)) ? { x:Math.round(v.x), y:Math.round(v.y) } : null; }
function setHitSaved(sKey, pt){ if (!pt || isNaN(pt.x) || isNaN(pt.y)) return; hitsMap[sKey] = { x:Math.round(pt.x), y:Math.round(pt.y) }; }

function databaseSituationSnapshot(situation){
  if(!situation) return null;
  const snapshot = Fcopy(situation);
  snapshot.starts = Fcopy(startsMap[snapshot.key] || snapshot.starts || DEFAULT_STARTS);
  const savedHit = getHitSaved(snapshot.key);
  if(savedHit) snapshot.hit = savedHit;
  return snapshot;
}

function queueCurrentSituationDatabaseSync(){
  if(!coachUnlocked || !currentSituation) return;
  const snapshot = databaseSituationSnapshot(currentSituation);
  if(snapshot) window._diqMarkSituationDirty?.(snapshot, situationEditorRole);
}
window._diqGetCurrentSituationSnapshot = ()=>databaseSituationSnapshot(currentSituation);

function setTargetFor(sKey,id,pt,tol=DEFAULT_TOL){
  const s = SITUATIONS.find(x=>x.key===sKey); if(!s) return;
  if(!s.targets) s.targets={};
  const prev = s.targets[id] || {};
  const prevNotes = (typeof prev.notes === 'string') ? prev.notes : '';
  const prevTol = (Number.isFinite(prev.tol) ? prev.tol : DEFAULT_TOL);
  // Preserve per-target notes when moving/updating target coordinates.
  s.targets[id] = {
    ...prev,
    x: Math.round(pt.x),
    y: Math.round(pt.y),
    tol: Number(tol || prevTol || DEFAULT_TOL),
    notes: prevNotes
  };
  if(currentSituation && currentSituation.key === sKey) queueCurrentSituationDatabaseSync();
}
function getTargetFor(sKey,id){
  const s = SITUATIONS.find(x=>x.key===sKey);
  return (s && s.targets && s.targets[id]) ? s.targets[id] : null;
}

function normPoint(px){
  if (!px || isNaN(px.x) || isNaN(px.y)) return null;
  let x=Number(px.x), y=Number(px.y);
  if (x>=0 && x<=1 && y>=0 && y<=1){ x=Math.round(x*IMG_W); y=Math.round(y*IMG_H); } else { x=Math.round(x); y=Math.round(y); }
  return {x,y};
}
function normalizeStarts(obj){
  if (!obj || typeof obj !== 'object') return null;
  const out={}; POS_IDS.forEach(id=>{ if (obj[id]){ const p=normPoint(obj[id]); if(p) out[id]=p; }});
  return Object.keys(out).length ? out : null;
}
function normalizeTargets(obj){
  const out={}; if (!obj || typeof obj !== 'object') return out;
  POS_IDS.forEach(id=>{
    const raw = obj[id];
    if (raw){
      const p = normPoint(raw);
      if (p){
        out[id] = {
          x:p.x, y:p.y,
          tol: Number(raw.tol) || DEFAULT_TOL,
          notes: typeof raw.notes === 'string' ? raw.notes : ''
        };
      }
    }
  });
  return out;
}
function normalizeHit(obj){ if (!obj || typeof obj !== 'object') return {}; const p=normPoint(obj); return p ? {x:p.x,y:p.y} : {}; }
function mapHitType(v){ const t=String(v||'').toLowerCase(); return (t==='line'||t==='popup'||t==='grounder')?t:'line'; }

async function loadSituationsFromJson(){
  const arr = await diqApiRequest('situations', { cache:'no-store' });
  if(!Array.isArray(arr)) throw new Error('Situation API did not return an array.');
  if(arr.length === 0) throw new Error('The database contains no situations. Run the database seed command.');
  SITUATIONS = arr.map((raw,i)=> normalizeSituation(raw,i));
  console.info('[Database] Loaded', SITUATIONS.length, 'situations.');
  snapshotSituationsOrig();
}


function snapshotSituationsOrig(){
  try{
    const snap = {};
    (SITUATIONS||[]).forEach(s=>{
      if(!s || !s.key) return;
      snap[s.key] = JSON.parse(JSON.stringify(s));
    });
    SITUATIONS_ORIG_BY_KEY = snap;
  }catch(_e){
    SITUATIONS_ORIG_BY_KEY = {};
  }
}

function restoreSituationFromOrig(key){
  const orig = SITUATIONS_ORIG_BY_KEY && SITUATIONS_ORIG_BY_KEY[key];
  if(!orig) return;
  const idx = (SITUATIONS||[]).findIndex(s=>s && s.key===key);
  if(idx>=0){
    SITUATIONS[idx] = JSON.parse(JSON.stringify(orig));
    // keep currentSituation pointing at the live object
    if(currentSituation && currentSituation.key===key){
      currentSituation = SITUATIONS[idx];
    }
  }
}


// Merge situations from an imported JSON array. Existing keys are deep-merged (import wins).
// Also updates startsMap/hitsMap so imported starts/hit are reflected immediately.
function _diqDeepMerge(dst, src){
  if(!dst || typeof dst!=='object' || Array.isArray(dst)) return deepClone(src);
  if(!src || typeof src!=='object' || Array.isArray(src)) return deepClone(src);
  const out = { ...dst };
  Object.keys(src).forEach(k=>{
    const sv = src[k];
    const dv = dst[k];
    if(sv && typeof sv==='object' && !Array.isArray(sv) && dv && typeof dv==='object' && !Array.isArray(dv)){
      out[k] = _diqDeepMerge(dv, sv);
    }else{
      out[k] = deepClone(sv);
    }
  });
  return out;
}

function mergeSituationsFromArray(rawArr){
  if(!Array.isArray(rawArr)) throw new Error('Situations JSON must be an array.');
  let added = 0, updated = 0;

  rawArr.forEach((raw,i)=>{
    const incoming = normalizeSituation(raw, i);
    if(!incoming || !incoming.key) return;

    const idx = (SITUATIONS||[]).findIndex(s=>s && s.key===incoming.key);
    if(idx >= 0){
      const merged = _diqDeepMerge(SITUATIONS[idx], incoming);
      SITUATIONS[idx] = normalizeSituation(merged, idx);
      // Keep currentSituation pointing at the live object
      if(currentSituation && currentSituation.key === incoming.key){
        currentSituation = SITUATIONS[idx];
      }
      updated++;
    }else{
      SITUATIONS.push(incoming);
      added++;
    }

    // Imported starts/hit should apply immediately (local starts/hit override otherwise)
    if(incoming.starts){
      startsMap[incoming.key] = Fcopy(incoming.starts);
    }else if(!startsMap[incoming.key]){
      startsMap[incoming.key] = Fcopy(DEFAULT_STARTS);
    }
    if(incoming.hit && !isNaN(incoming.hit.x) && !isNaN(incoming.hit.y)){
      setHitSaved(incoming.key, incoming.hit);
    }
  });

  // Persist local overrides so reloading keeps the merged set consistent
  try{ saveStarts(); }catch(_e){}
  try{ saveHits(); }catch(_e){}

  return { added, updated };
}


/* ===== [A8.1] Description HUD helpers (mobile-friendly) ===== */
function updateDescriptionHudText(){
  const el = document.getElementById('descHud');
  if (!el || !currentSituation) return;
  const txt = currentSituation.desc || '';
  el.textContent = txt;
  el.title = txt || '';
}

// @diq:end [A8]
/// @diq:begin [A9] Situation lifecycle
function updateCurrentOptionLabel(){
  if (!sitSelect || !currentSituation) return;
  const opt = sitSelect.querySelector(`option[value="${currentSituation.key}"]`);
  if (opt) opt.textContent = currentSituation.title || currentSituation.key;
}

function syncSituationInputsFromCurrent(){
  if (!currentSituation) return;

  withInputMute(() => {
    if (newTitleInput) newTitleInput.value = currentSituation.title || currentSituation.key || '';
    if (newDescInput)  newDescInput.value  = currentSituation.desc  || '';
  });

  if (descHud)     descHud.textContent     = currentSituation.desc  || '';

  const o = clampInt((currentSituation.outs ?? 0), 0, 2);
  setOuts(o, { quiet: true });

  // Coach tools: keep Play Sequence + notes inputs in sync with the selected situation
  if (seqNoteInput) seqNoteInput.value = (typeof currentSituation.seqNote === 'string') ? currentSituation.seqNote : '';
  if (typeof renderSeqBuilder === 'function') renderSeqBuilder();
}

function startsToTargets(starts, tol=DEFAULT_TOL){
  const out={}; POS_IDS.forEach(id=>{ const p=starts[id]; if(p) out[id]={ x:Math.round(p.x), y:Math.round(p.y), tol:Number(tol)||DEFAULT_TOL }; });
  return out;
}

// Generates a unique, title-independent key. Keys never change when you edit titles.
let __NEW_KEY_SEQ = 0;
function genUniqueKey(_title){
  const has = key => (SITUATIONS || []).some(s => s.key === key);
  let key;
  do {
    // S-<base36 timestamp>-<base36 counter>, all uppercase for consistency
    key = `S-${Date.now().toString(36)}-${(__NEW_KEY_SEQ++).toString(36)}`.toUpperCase();
  } while (has(key));
  return key;
}

function nextNewSituationTitle(){
  const base = 'New Situation';

  // Collect numbers from titles that match:
  // "New Situation"  -> 1
  // "New Situation N" -> N
  const nums = (SITUATIONS || [])
    .map(s => String(s.title || ''))
    .map(t => {
      const m = t.match(/^New Situation(?: (\d+))?$/);
      return m ? Number(m[1] || 1) : null;
    })
    .filter(n => n != null);

  if (nums.length === 0) return base;

  const next = Math.max(...nums) + 1;
  return `${base} ${next}`;
}

function makeBlankSituation(){
  const title = nextNewSituationTitle();            // UI label only; can be edited later
  const desc  = '';
  const key   = genUniqueKey(title);                // Stable key (not tied to title)

  const outsInit = outsSelSituation
    ? clampInt(outsSelSituation.value, 0, 2)
    : clampInt(currentSituation?.outs ?? 0, 0, 2);

  const runnersInit = getRunnersFromCheckboxes();

  return {
    key,
    title,
    desc,
    starts: Fcopy(DEFAULT_STARTS),
    targets: (() => {
      const t = {};
      POS_IDS.forEach(id => { const p = DEFAULT_STARTS[id]; if (p) t[id] = { x:p.x, y:p.y, tol:DEFAULT_TOL }; });
      return t;
    })(),
    hit: { x:1600, y:700 },
    hitType: 'line',
    batterAdvance: 1,
    outs: outsInit,
    runnersOn: normalizeRunnersOn(runnersInit)
  };
}

function addNewSituation(){
  const s = makeBlankSituation();

  // Add to model + persist default starts for this key
  SITUATIONS.push(s);
  startsMap[s.key] = Fcopy(s.starts);
  saveStarts();

  // Rebuild the dropdown (includes the new option) and switch to it immediately
  populateSituations(s.key);
  setSituation(s.key);                 // currentSituation now points to the newly created situation
  if (sitSelect) sitSelect.value = s.key;

  // Seed inputs without triggering 'input' listeners
  withInputMute(() => {
    if (newTitleInput) newTitleInput.value = s.title || '';
    if (newDescInput)  newDescInput.value  = s.desc  || '';
  });

  // Put caret in Title for convenience
  setTimeout(() => { try { newTitleInput?.focus(); } catch{} }, 0);

  if (typeof updateDescriptionHudText === 'function') updateDescriptionHudText();

  if (situationMsg){
    situationMsg.textContent = 'New situation created.';
    setTimeout(() => situationMsg.textContent = '', 1400);
  }
  queueCurrentSituationDatabaseSync();
}

function deleteCurrentSituation(){
  if (!currentSituation) return;
  const key = currentSituation.key;
  const idx = (SITUATIONS||[]).findIndex(s=>s.key===key);
  if (idx < 0) return;
  const ok = confirm(`Archive situation "${currentSituation.title||key}"? It can be restored from Admin tools.`);
  if (!ok) return;

  try{ window._diqDeleteSituation && window._diqDeleteSituation(key, currentSituation.revision); }catch(_e){}

  // Remove from arrays/maps + persist
  SITUATIONS.splice(idx,1);
  if (startsMap && startsMap[key]){ delete startsMap[key]; saveStarts(); }
  if (hitsMap && hitsMap[key]){ delete hitsMap[key]; saveHits(); }

  // Ensure at least one situation remains
  if (!SITUATIONS.length){
    const s = makeBlankSituation();
    SITUATIONS.push(s);
    startsMap[s.key] = Fcopy(s.starts||DEFAULT_STARTS);
    saveStarts();
  }
  try{ if(preSnap) sbPushUndo(preSnap); }catch(e){}

  // Pick next selection (prefer previous index)
  const nextIdx = Math.max(0, Math.min(idx, SITUATIONS.length - 1));
  const nextKey = SITUATIONS[nextIdx].key;

  // Rebuild UI
  populateSituations(nextKey);
  setSituation(nextKey);

  if (situationMsg){
    situationMsg.textContent = 'Situation archived.';
    setTimeout(()=> situationMsg.textContent = '', 1400);
  }
}

function resetStartsToDefaults(){
  if (!currentSituation) return;
  const preSnap = (coachUnlocked ? sbSnapshot() : null);
  POS_IDS.forEach(id=>{
    const p = DEFAULT_STARTS[id];
    const rec = tokens.get(id);
    if (rec){ rec.pos = { x:p.x, y:p.y }; placeToken(id); }
  });
  currentSituation.starts = Fcopy(DEFAULT_STARTS);
  if (currentSituation.key){
    startsMap[currentSituation.key] = Fcopy(DEFAULT_STARTS);
    saveStarts();
  }
  try{ if(preSnap) sbPushUndo(preSnap); }catch(e){}
  if (situationMsg){
    situationMsg.textContent = 'Player starts reset to defaults.';
    setTimeout(()=> situationMsg.textContent = '', 1400);
  }
}
function pickRandomSituation(){
  if (!Array.isArray(SITUATIONS) || SITUATIONS.length === 0) return;
  const cur = sitSelect && sitSelect.value || (currentSituation && currentSituation.key);
  let keys = SITUATIONS.map(s=>s.key);
  if (cur && keys.length > 1) keys = keys.filter(k=>k !== cur);
  const key = keys[Math.floor(Math.random() * keys.length)];
  if (sitSelect) sitSelect.value = key;
  setSituation(key);
}

function populateSituations(selectedKey){
  const prev = sitSelect ? sitSelect.value : '';
  if (sitSelect) sitSelect.innerHTML = '';

  (SITUATIONS||[]).forEach(s=>{
    const o = document.createElement('option');
    o.value = s.key;
    o.textContent = s.title || s.key;
    sitSelect.appendChild(o);
  });

  const keyExists = k => (SITUATIONS||[]).some(s => s.key === k);
  const want =
    (selectedKey && keyExists(selectedKey)) ? selectedKey :
    (keyExists(prev) ? prev :
     (SITUATIONS[0] && SITUATIONS[0].key));

  if (want && sitSelect) sitSelect.value = want;
}




function setSituation(key){
  void window._diqAbandonCurrentPlayAttempt?.('situation_changed');
  currentSituation = getSituationByKey(key) || SITUATIONS[0];
  if (!currentSituation) return;

  renderSeqBuilder();

  wipePhase2StateUI();
  stopTimer();
  _timerSecs = TIMER_START_SECS;
  updateTimerHud();

  // Any time we switch situations, selection mode should be off
  disableTargetSelection();
  hideTargetPanel();
  hideFieldNotice();
  _allTargetsCorrect = false;
  _roundHasStarted = false;
  _phase2Ended = false;

  if (!tokens || tokens.size===0) buildTokens();
  resetBallAndRunnerForSituation();

  // Title + Description UI
  if (descHud)  descHud.textContent  = currentSituation.desc  || '';

  const savedHit = getHitSaved(currentSituation.key); if (savedHit) currentSituation.hit = savedHit;

  // Tolerance dropdown
  tolTargetSel.innerHTML='';
  POS_IDS.forEach(id=>{
    const opt=document.createElement('option'); opt.value=id; opt.textContent=id;
    tolTargetSel.appendChild(opt);
  });

  // Move chips to starts
  POS_IDS.forEach(id=>{
    const t=tokens.get(id); if(!t) return;
    t.pos = Fcopy(getStartFor(currentSituation.key,id));
    placeToken(id);
  });

  // If this situation has no targets yet, seed them from the current chip starts
  if (!currentSituation.targets || Object.keys(currentSituation.targets).length === 0) {
    currentSituation.targets = startsToTargets(getOnscreenStarts(), DEFAULT_TOL);
  }

  // Targets & coach visibility
  buildTargets();
  if (!coachUnlocked) getAllRings().forEach(el=> el.style.display='none');

  // HUD / controls
  updateHud(0); gameActive=false; remainingTries=0;
  startBtn.disabled=!hasGameAccess(); resetBtn.disabled=true; checkBtn.disabled=true;
  setChipsLocked(!coachUnlocked);

  // Tolerance inputs
  const firstId=POS_IDS[0];
  tolTargetSel.value=firstId;
  syncTolInputsFromModel(firstId);

  // >>> sync the Notes textarea with the selected target <<<
  if (tolTargetSel){
    const id = tolTargetSel.value || POS_IDS[0];
    syncTolNotesFromModel(id);
  }

  // Hit + ball (single-ball model: no orange marker in coach mode)
  if (hitMarker){ hitMarker.remove(); hitMarker = null; }
  syncBallToHit();
  if (ballEl){
    ballEl.style.display = (coachUnlocked || gameActive) ? 'block' : 'none';
    ballEl.classList.toggle('locked', !coachUnlocked);
    ballEl.style.zIndex = '10';
  }

  // Hit meta
  if (typeof currentSituation.hitType==='string') hitTypeSel.value=currentSituation.hitType;
  else currentSituation.hitType = hitTypeSel.value || 'line';

  if (typeof currentSituation.batterAdvance==='number') {
    advanceSel.value = String(clampInt(currentSituation.batterAdvance,0,4));
  } else {
    advanceSel.value = String(mapHitTypeToAdvance(currentSituation.hitType));
    currentSituation.batterAdvance = clampInt(advanceSel.value,0,4);
  }

  // Outs and runners
  const outsInit=clampInt((currentSituation.outs ?? 0),0,2);
  setOuts(outsInit,{quiet:true});
  setRunnersOn(normalizeRunnersOn(currentSituation.runnersOn), {quiet:true});

  // Sync Coach Tool inputs
  syncSituationInputsFromCurrent();
  applyCoachVisibility();

  renderBaseRunners();
  scaleMarkers();
  updateRunnersHudFromLive();

  if (continueBtn) continueBtn.classList.add('hidden');
  endPhase2(false); // ensure phase state is cleared
  phase2ClearAllUI();

  if (seqInput){
    const seq = (currentSituation.playSeq || []).join(', ');
    withInputMute(()=> { seqInput.value = seq; });
  }

  // Reset Situation Builder history when switching situations
  try{ sbEnsureKey(); sbUpdateButtons(); }catch(e){}

  setHowToPhase('p1');
}

// @diq:end [A9]
/// @diq:begin [A10] Export helpers
function getOnscreenStarts(){ const out={}; POS_IDS.forEach(id=>{ const rec=tokens.get(id); if(rec&&rec.pos) out[id]={x:Math.round(rec.pos.x),y:Math.round(rec.pos.y)}; }); return out; }
function getRenderedTargets(){
  const out = {};
  getAllRings().forEach(el=>{
    const id   = el.dataset.id;
    const left = parseFloat(el.style.left), top = parseFloat(el.style.top);
    const native = cssToUnit(left, top);
    const modelT = currentSituation.targets?.[id];
    out[id] = {
      x: Math.round(native.x),
      y: Math.round(native.y),
      tol: Math.round(modelT?.tol ?? DEFAULT_TOL),
      notes: modelT?.notes || ''
    };
  });
  return out;
}


// --- Situation Builder Undo/Redo (chips + targets + tolerance + notes) ---
function sbSnapshot(){
  if(!currentSituation) return null;
  const key = currentSituation.key;
  const starts = getOnscreenStarts();
  const targets = {};
  const t = currentSituation.targets || {};
  Object.entries(t).forEach(([id,pt])=>{
    targets[id] = { x:Math.round(pt.x), y:Math.round(pt.y), tol:Number(pt.tol)||DEFAULT_TOL, notes: (typeof pt.notes==='string'?pt.notes:'') };
  });
  return {
    key,
    starts,
    targets,
    tolSel: (tolTargetSel && tolTargetSel.value) ? String(tolTargetSel.value) : null
  };
}
function sbSame(a,b){
  if(!a || !b) return false;
  if(a.key !== b.key) return false;
  for(const id of POS_IDS){
    const pa=a.starts?.[id], pb=b.starts?.[id];
    if(!pa || !pb) return false;
    if(Math.round(pa.x)!==Math.round(pb.x) || Math.round(pa.y)!==Math.round(pb.y)) return false;
  }
  for(const id of POS_IDS){
    const ta=a.targets?.[id], tb=b.targets?.[id];
    if(!ta || !tb) return false;
    if(Math.round(ta.x)!==Math.round(tb.x) || Math.round(ta.y)!==Math.round(tb.y)) return false;
    if(Math.round(Number(ta.tol)||0)!==Math.round(Number(tb.tol)||0)) return false;
    if(String(ta.notes||'')!==String(tb.notes||'')) return false;
  }
  return true;
}
function sbEnsureKey(){
  const key = currentSituation && currentSituation.key;
  if(!key) return;
  if(sbHistKey !== key){
    sbHistKey = key;
    sbUndoStack = [];
    sbRedoStack = [];
    _sbTolStartSnap = null;
    _sbNotesStartSnap = null;
    sbUpdateButtons();
  }
}
function sbUpdateButtons(){
  if(sbUndoBtn) sbUndoBtn.disabled = !(coachUnlocked && sbUndoStack.length);
  if(sbRedoBtn) sbRedoBtn.disabled = !(coachUnlocked && sbRedoStack.length);
}
function sbPushUndo(preSnap){
  if(!coachUnlocked) return;
  if(!currentSituation) return;
  sbEnsureKey();
  if(!preSnap || preSnap.key !== sbHistKey) return;
  const cur = sbSnapshot();
  if(!cur) return;
  if(sbSame(preSnap, cur)) return;
  sbUndoStack.push(preSnap);
  if(sbUndoStack.length > SB_HISTORY_MAX) sbUndoStack.shift();
  sbRedoStack = [];
  sbUpdateButtons();
  queueCurrentSituationDatabaseSync();
}
function sbApplySnap(snap){
  if(!snap || !currentSituation) return;
  if(snap.key !== currentSituation.key) return;

  // Apply starts (chips)
  const starts = snap.starts || {};
  POS_IDS.forEach(id=>{
    const pt = starts[id];
    const rec = tokens.get(id);
    if(rec && pt){
      rec.pos = { x:pt.x, y:pt.y };
      placeToken(id);
    }
  });

  // Persist starts for this situation (coach edits only)
  try{
    if(currentSituation.key){
      startsMap[currentSituation.key] = Fcopy(getOnscreenStarts());
      saveStarts();
      currentSituation.starts = Fcopy(startsMap[currentSituation.key]);
    }
  }catch(e){}

  // Apply targets model (x,y,tol,notes)
  const nextTargets = {};
  POS_IDS.forEach(id=>{
    const pt = (snap.targets && snap.targets[id]) ? snap.targets[id] : null;
    const base = pt || startsToTargets(getOnscreenStarts(), DEFAULT_TOL)[id];
    nextTargets[id] = {
      x: Math.round(base.x),
      y: Math.round(base.y),
      tol: Number(base.tol)||DEFAULT_TOL,
      notes: String(base.notes||'')
    };
  });
  currentSituation.targets = nextTargets;

  // Rebuild rings and re-sync tolerance/notes UI
  buildTargets();
  if(!coachUnlocked) getAllRings().forEach(el=> el.style.display='none');

  const sel = snap.tolSel && POS_IDS.includes(snap.tolSel) ? snap.tolSel : (tolTargetSel?.value || POS_IDS[0]);
  if(tolTargetSel){
    tolTargetSel.value = sel;
    syncTolInputsFromModel(sel);
  }
  sbUpdateButtons();
}
function sbUndo(){
  if(!coachUnlocked) return;
  if(!currentSituation) return;
  sbEnsureKey();
  if(!sbUndoStack.length) return;
  const cur = sbSnapshot();
  const prev = sbUndoStack.pop();
  if(cur) sbRedoStack.push(cur);
  sbApplySnap(prev);
}
function sbRedo(){
  if(!coachUnlocked) return;
  if(!currentSituation) return;
  sbEnsureKey();
  if(!sbRedoStack.length) return;
  const cur = sbSnapshot();
  const next = sbRedoStack.pop();
  if(cur) sbUndoStack.push(cur);
  sbApplySnap(next);
}

function getHitForExport(sit){ return sit && sit.hit ? { x:Math.round(sit.hit.x), y:Math.round(sit.hit.y) } : undefined; }
function getStartsForExport(key){
  const src=(startsMap && startsMap[key]) ? startsMap[key] : DEFAULT_STARTS;
  const out={}; POS_IDS.forEach(id=>{ const p=src[id] || DEFAULT_STARTS[id]; out[id]={ x:Math.round(p.x), y:Math.round(p.y) }; });
  return out;
}
function composeSituationForExport(base, starts, targets, hit){
  const extra = { ...base };
  delete extra.starts;
  delete extra.targets;
  delete extra.hit;

  const payload = { ...extra, starts, targets };
  if (hit) payload.hit = hit;

  if (base.hitType) payload.hitType = base.hitType;
  if (typeof base.batterAdvance === 'number') {
    payload.batterAdvance = clampInt(base.batterAdvance, 0, 4);
  }

  if (Array.isArray(base.playSeq) && base.playSeq.length) {
    payload.playSeq = base.playSeq.slice();
  }
  if (typeof base.seqNote === 'string' && base.seqNote.trim()) {
    payload.seqNote = base.seqNote;
  }

  return payload;
}

function buildCurrentSituationExport(){
  const s=currentSituation || SITUATIONS[0]; if(!s) return '[]';
  const one=composeSituationForExport(s, getOnscreenStarts(), getRenderedTargets(), getHitForExport(s));
  return JSON.stringify([one],null,2);
}
function buildAllSituationsExport(){
  const arr=(SITUATIONS||[]).map(s=>{
    const isCurrent=currentSituation && (s.key===currentSituation.key);
    const starts=isCurrent?getOnscreenStarts():getStartsForExport(s.key);
    let targets=isCurrent?getRenderedTargets():{};
    if (!isCurrent){
      Object.entries(s.targets||{}).forEach(([id,pt])=>{
        targets[id] = {
          x: Math.round(pt.x),
          y: Math.round(pt.y),
          tol: Math.round(pt.tol || DEFAULT_TOL),
          notes: pt.notes || ''
        };
      });
    }
    const hit=getHitSaved(s.key) || getHitForExport(s);
    return composeSituationForExport(s,starts,targets,hit);
  });
  return JSON.stringify(arr,null,2);
}

function buildResultsExportPayload(){
  return {
    type: 'diamondiq_results_v1',
    exportedAt: new Date().toISOString(),
    playerId: getPlayerId(),
    results: RESULTS
  };
}
function buildResultsExportText(){
  return JSON.stringify(buildResultsExportPayload(), null, 2);
}
function downloadResults(){
  const text = buildResultsExportText();
  const blob = new Blob([text], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `diamondiq_results_${getPlayerId()}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
}
async function copyResults(){
  const text = buildResultsExportText();
  await navigator.clipboard.writeText(text);
}

/* =========================
   Coach: Player Results Viewer (parse + render)
   ========================= */

function parsePlayerResultsPayload(rawText){
  const txt = String(rawText || '').trim();
  if(!txt) return { ok:false, error:'Paste a player results JSON first.' };

  let obj;
  try{
    obj = JSON.parse(txt);
  }catch(e){
    return { ok:false, error:'Invalid JSON. Make sure you copied the full exported JSON.', detail: String((e && e.message) || e) };
  }

  // Expected wrapper: { type:'diamondiq_results_v1', exportedAt, playerId, results:{log,bySituation} }
  if(obj && typeof obj === 'object' && !Array.isArray(obj)){
    if(obj.type && String(obj.type).indexOf('diamondiq_results') === 0 && obj.results && typeof obj.results === 'object'){
      return { ok:true, kind:'results', meta:{ type:obj.type, exportedAt:obj.exportedAt, playerId:obj.playerId }, results: obj.results, raw: obj };
    }
    if(obj.log && obj.bySituation){
      return { ok:true, kind:'results', meta:{}, results: obj, raw: obj };
    }
    if(obj.situations || obj.SITUATIONS){
      return { ok:false, error:'This looks like situations JSON (coach export), not player results JSON.' };
    }
  }

  if(Array.isArray(obj)){
    return { ok:false, error:'This looks like situations JSON (an array). Paste the player Results JSON instead.' };
  }

  return { ok:false, error:'Unrecognized JSON shape. Paste the player Results JSON exported from the Player panel.' };
}

function _escHtml(s){
  return String(s==null?'':s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function _fmtMs(ms){
  if(ms==null || !Number.isFinite(ms)) return '—';
  const sec = Math.round(ms/100)/10; // 0.1s
  return sec.toFixed(1)+'s';
}
function _fmtIso(ts){
  if(!ts) return '—';
  try{ return new Date(ts).toLocaleString(); }catch(e){ return String(ts); }
}

function download(filename,content){
  const blob=new Blob([content], {type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}

function safeSituationJsonFilename(titleOrKey){
  let base = String(titleOrKey || '').trim();
  if(!base) base = 'situation';
  // Remove characters illegal in Windows filenames and trim length
  base = base.replace(/[\\/:*?\"<>|]+/g,'').replace(/\s+/g,' ').trim();
  if(!base) base = 'situation';
  base = base.slice(0, 80);
  // Avoid double extension
  if(!/\.json$/i.test(base)) base += '.json';
  return base;
}

/// @diq:begin [A10.1] One-button refresh (saves Coach Tools + rebuilds UI)
function refreshSituationAll(){
  if (!currentSituation) return;

  // 1) Title / Description
  if (newTitleInput){
    const t = newTitleInput.value.trim();
    if (t) currentSituation.title = t;
  }
  if (newDescInput){
    currentSituation.desc = newDescInput.value.trim();
  }

  // 2) Outs (HUD + dropdown sync)
  if (outsSelSituation){
    setOuts(outsSelSituation.value, {quiet:true});
  } else {
    currentSituation.outs = clampInt(currentSituation.outs ?? 0, 0, 2);
  }

  // 3) Runners (model + HUD + markers)
  setRunnersOn(getRunnersFromCheckboxes(), {quiet:true});

  // 4) Starts: pull from chips and persist
  const starts = getOnscreenStarts();
  const prevTargets = currentSituation.targets || {};
  let targets = getRenderedTargets();
  if (!targets || Object.keys(targets).length === 0){
    targets = {};
    POS_IDS.forEach(id=>{
      const p = starts[id];
      if (p) targets[id] = { x:Math.round(p.x), y:Math.round(p.y), tol:DEFAULT_TOL, notes:(typeof (prevTargets[id]||{}).notes==='string' ? (prevTargets[id]||{}).notes : '') };
    });
  }
  currentSituation.targets = {};
  Object.entries(targets).forEach(([id,pt])=>{
    const prev = prevTargets[id] || {};
    const notes = (typeof pt.notes === 'string') ? pt.notes : ((typeof prev.notes === 'string') ? prev.notes : '');
    currentSituation.targets[id] = {
      x: Math.round(pt.x),
      y: Math.round(pt.y),
      tol: Number(pt.tol) || DEFAULT_TOL,
      notes
    };
  });

  // 6) Hit + meta (+ persist hit location only)
  ensureDefaultHit();
  currentSituation.hitType = (hitTypeSel && hitTypeSel.value) || currentSituation.hitType || 'line';
  currentSituation.batterAdvance = clampInt(
    (advanceSel && advanceSel.value) ?? currentSituation.batterAdvance ?? 1,
    0, 4
  );
  setHitSaved(currentSituation.key, currentSituation.hit);
  saveHits();

  // 7) Rebuild UI pieces to reflect the saved model
  populateSituations(currentSituation.key);

  if (descHud) descHud.textContent = currentSituation.desc || '';
  if (typeof updateDescriptionHudText === 'function') updateDescriptionHudText();

  // Rebuild targets (applies new tolerance sizes), hit marker & ball
  buildTargets();
  placeHitMarker();
  syncBallToHit();
  renderBaseRunners();
  scaleMarkers();
  updateRunnersHudFromLive();

  // Keep tolerance inputs in sync with selected target
  if (tolTargetSel){
    const id = tolTargetSel.value || POS_IDS[0];
    if (id) syncTolInputsFromModel(id);
  }

  // 8) Toasty message
  if (situationMsg){
    situationMsg.textContent='Situation refreshed.';
    setTimeout(()=> situationMsg.textContent='', 1400);
  }

  if (seqInput){
    const parts = String(seqInput.value || '')
      .split(',')
      .map(s => s.toUpperCase().trim())
      .filter(s => POS_IDS.includes(s));
    currentSituation.playSeq = parts; // [] disables Phase 2
  }

  if (seqNoteInput){
    currentSituation.seqNote = String(seqNoteInput.value || '');
  }

  queueCurrentSituationDatabaseSync();

}

// Use one canonical saver; keep alias for any internal callers.
const saveCurrentSituation = refreshSituationAll;

// @diq:end [A10]
/// @diq:begin [A11] Game flow
function checkPositions(){
  if (!coachUnlocked && !gameActive) return;

  const t = currentSituation?.targets || {};
  let correct = 0;

  // Before decrementing tries, determine if this is the last available try
  const isFinalTry = (!coachUnlocked && gameActive && remainingTries === 1);

  // Evaluate each position vs its target ring
  getAllRings().forEach(el => {
    const id = el.dataset.id;
    const target = t[id];
    if (!target) return;

    const cur = tokens.get(id)?.pos;
    const tol = Number(target.tol) || DEFAULT_TOL;

    const d = Math.hypot((cur?.x ?? 0) - target.x, (cur?.y ?? 0) - target.y);
    const isCorrect = d <= tol;

    el.classList.toggle('good', isCorrect);
    el.classList.toggle('bad', !isCorrect);
    el.classList.add('show-label');

    if (coachUnlocked) {
      // Coach sees all rings
      el.style.display = 'block';
    } else {
      // Players: show only correct rings until final try; on final try show all
      el.style.display = (isFinalTry || isCorrect) ? 'block' : 'none';
    }

    if (isCorrect) correct++;
  });

  // Update numeric score + badge color
  updateHud(correct);
  if (scoreBadge){
    const pct = correct / 9;
    const state = pct >= 2/3 ? 'green' : (pct >= 1/3 ? 'yellow' : 'red');
    setBadgeState(scoreBadge, state, 'score');
  }

  // Non-coach: handle tries, end-of-round, and Phase-2 handoff
  if (!coachUnlocked){
    const allCorrectNow = (correct === POS_IDS.length);
    _allTargetsCorrect = allCorrectNow;

    if (gameActive){
      // Consume a try after showing rings
      remainingTries = Math.max(0, remainingTries - 1);
      updateHud(correct);
      window._diqTrackPhaseOneCheck?.({
        scoreCorrect:correct,
        scoreTotal:Array.isArray(POS_IDS) ? POS_IDS.length : 9,
        triesUsed:MAX_TRIES - remainingTries,
        remainingTries,
      });
    }

    const outOfTries = (remainingTries === 0);
    const shouldEndRound = allCorrectNow || outOfTries;

    if (shouldEndRound){
      // Stop timer and hide the Check button
      stopTimer();
      // Capture Phase 1 outcome for Coach Review / exports (tokens passed or failed)
      try{
        _phase1Summary = {
          ok: !!allCorrectNow,
          scoreCorrect: correct,
          scoreTotal: (Array.isArray(POS_IDS) ? POS_IDS.length : 9),
          triesUsed: (MAX_TRIES - remainingTries),
          elapsed: (typeof _timerSecs === 'number') ? Math.max(0, TIMER_START_SECS - _timerSecs) : null,
          ts: Date.now()
        };
      }catch(e){ _phase1Summary = null; }

      if (checkBtn) checkBtn.classList.add('hidden');

      // Lock chips; keep round open for inspection
      setChipsLocked(true);
      gameActive = false;

      // Allow clicking target rings to view notes (post-round)
      enableTargetSelection();

      // Show the instruction card once a round actually started
      if (_roundHasStarted){
        if (typeof showTargetInstruction === 'function') {
          showTargetInstruction();
        } else if (typeof showTargetPanel === 'function') {
          showTargetPanel();
        }
        showFieldNotice();
      }

      // If a sequence exists, reveal Continue and switch How-to to Phase 2
      const hasSeq = (typeof getSeqForCurrent === 'function') && getSeqForCurrent().length > 0;
      void window._diqCompletePhaseOneAttempt?.(_phase1Summary, hasSeq);

      if (_roundHasStarted && continueBtn){
        if (hasSeq) continueBtn.classList.remove('hidden');
        else        continueBtn.classList.add('hidden');
      }

      // Swap the How-to card contents to Phase 2 rules when applicable
      if (hasSeq && typeof setHowToPhase === 'function'){
        setHowToPhase('p2');
      }
    }
  }
}

function resetBallAndRunnerForSituation(){
  if (animReq){ cancelAnimationFrame(animReq); animReq=null; }
  if (ballSvg) ballSvg.innerHTML='';
  if (ballEl) syncBallToHit();
  if (runnerAnimId){ cancelAnimationFrame(runnerAnimId); runnerAnimId=null; }
  hideRunner();
}

function resetPlayers(reason='reset'){
  const abandonReason = typeof reason === 'string' ? reason : 'reset';
  void window._diqAbandonCurrentPlayAttempt?.(abandonReason);
  wipePhase2StateUI();
  _phase2Ended = false;
  stopTimer();
  _timerSecs = TIMER_START_SECS;
  updateTimerHud();

  if (continueBtn) continueBtn.classList.add('hidden');

  // existing reset logic
  allowSeqPanel = false;
  disableTargetSelection();
  hideTargetPanel();
  _allTargetsCorrect = false;
  _roundHasStarted = false;

  POS_IDS.forEach(id=>{
    const t=tokens.get(id);
    if(!t) return;
    t.pos=Fcopy(getStartFor(currentSituation.key,id));
    placeToken(id);
  });

  getAllRings().forEach(el=> el.style.display=coachUnlocked ? 'block' : 'none');
  updateHud(0);
  gameActive=false;
  remainingTries=0;

  // Re-enable Start / Reset buttons
  startBtn.disabled=!hasGameAccess();
  resetBtn.disabled=true;

  // ⬅️ Make sure Check Positions is visible and reset to its initial state
  if (checkBtn){
    checkBtn.classList.remove('hidden');
    checkBtn.disabled = true;   // start disabled until "Start Situation" is pressed
  }

  setChipsLocked(!coachUnlocked);

  if (ballSvg) ballSvg.innerHTML='';
  if (ballEl) syncBallToHit();

  hideRunner();

  liveRunners = normalizeRunnersOn(currentSituation.runnersOn);
  renderBaseRunners();
  scaleMarkers();
  updateRunnersHudFromLive();

  setHowToPhase('p1');
}

// @diq:end [A11]
/// @diq:begin [A12] Init & events

const COACH_COLLAPSE_KEY = "diq_coachSubsecCollapsed_v1";

function _loadCoachCollapseMap(){
  try{ return JSON.parse(localStorage.getItem(COACH_COLLAPSE_KEY) || "{}") || {}; }catch(e){ return {}; }
}
function _saveCoachCollapseMap(map){
  try{ localStorage.setItem(COACH_COLLAPSE_KEY, JSON.stringify(map || {})); }catch(e){}
}

function initCoachToolsCollapsibles(){
  const card = document.getElementById("coachCard");
  if(!card) return;

  const map = _loadCoachCollapseMap();

  const subsecs = Array.from(card.querySelectorAll(".subsec"));
  subsecs.forEach(subsec=>{
    const already = (subsec.dataset.diqCollapsible === "1");

    const header = subsec.querySelector(":scope > .title") || subsec.querySelector(":scope > .sectionTitle");
    if(!header) return;

    // If it was already prepared in HTML, ensure body/chevron exist; otherwise prepare.
    if(already){
      subsec.classList.add("diq-collapsible");
      // Ensure chevron exists
      if(!header.querySelector(".diq-chevron")){
        const chev = document.createElement("span");
        chev.className = "diq-chevron";
        chev.textContent = "▾";
        header.appendChild(chev);
      }
      // Ensure body wrapper exists
      let body = subsec.querySelector(":scope > .diq-body");
      if(!body){
        body = document.createElement("div");
        body.className = "diq-body";
        const kids = Array.from(subsec.children);
        kids.forEach(el=>{ if(el!==header) body.appendChild(el); });
        subsec.appendChild(body);
      }
    } else {

    // Mark + add chevron
    subsec.dataset.diqCollapsible = "1";
    subsec.classList.add("diq-collapsible");

    // Chevron (visual)
    const chev = document.createElement("span");
    chev.className = "diq-chevron";
    chev.textContent = "▾";
    header.appendChild(chev);

    // Wrap remaining children into body
    const body = document.createElement("div");
    body.className = "diq-body";
    const kids = Array.from(subsec.children);
    kids.forEach(el=>{
      if(el === header) return;
      body.appendChild(el);
    });
    subsec.appendChild(body);
    }

    const key = subsec.id || (header.textContent || "").trim() || ("subsec_" + Math.random());
    const defaultCollapsed = true;
    const collapsed = (key in map) ? !!map[key] : defaultCollapsed;
    if(collapsed) subsec.classList.add("diq-collapsed");

    if(subsec.dataset.diqClickWired !== "1"){
      subsec.dataset.diqClickWired = "1";
      header.addEventListener("click", ()=>{
      const now = !subsec.classList.contains("diq-collapsed");
      // now=true means expanded; store collapsed=false
      subsec.classList.toggle("diq-collapsed");
      map[key] = subsec.classList.contains("diq-collapsed");
      _saveCoachCollapseMap(map);
      });
    }
  });
}

function setAllCoachSubsecsCollapsed(collapsed){
  const card = document.getElementById("coachCard");
  if(!card) return;
  const map = _loadCoachCollapseMap();
  const subsecs = Array.from(card.querySelectorAll(".subsec.diq-collapsible"));
  subsecs.forEach(subsec=>{
    const header = subsec.querySelector(":scope > .title") || subsec.querySelector(":scope > .sectionTitle");
    const key = subsec.id || (header && header.textContent ? header.textContent.trim() : "");
    if(!key) return;
    if(collapsed) subsec.classList.add("diq-collapsed");
    else subsec.classList.remove("diq-collapsed");
    map[key] = !!collapsed;
  });
  _saveCoachCollapseMap(map);
}

let _resolveDiamondIqReady;
window.__DIQ_READY__ = new Promise((resolve) => {
  _resolveDiamondIqReady = resolve;
});

async function init(){
  ensurePlayerMeta();
  try{
    // Ensure header metrics/actions are grouped before first paint
    ensureHeaderGrouping();
    observeHeader();
    sizeOverlays();

    await loadSituationsFromJson();
    await loadTeamsFromJson();
    await loadDatabaseSession();
    refreshTeamsUIAll();
    loadStarts(); loadHits();
    populateSituations();
    const firstKey = (sitSelect && sitSelect.value) || (SITUATIONS[0] && SITUATIONS[0].key);
    buildTokens(); updateChipScale(); setSituation(firstKey); setCoachMode(false);
    observeWrap(); scheduleLayout();

    updateDescriptionHudText();
    wireOnce();
    applyGameAccess();
  setCoachMode(coachUnlocked);
// Teams UI elements are wired after JSON load; refresh dropdowns now
      refreshTeamsUIAll();
      // The player controls are mounted into their popup by player-coach.js.
    setHowToPhase('p1');

  } catch (err){
    console.error('[Init] fatal error:', err && (err.stack||err.message||err));
    if(typeof showDatabaseUnavailable === 'function') showDatabaseUnavailable(err);
  }
  ensurePlayerMeta();
  _resolveDiamondIqReady?.();
}

function syncTolInputsFromModel(id){
  const t = getTargetFor(currentSituation.key, id);
  const tol = Number(t?.tol) || DEFAULT_TOL;
  if (tolNum)   tolNum.value   = String(tol);
  if (tolRange) tolRange.value = String(tol);
  // keep the ring sized live if it's on-screen
  const ring = getRingEl(id);
  if (ring){
    const d = tolToCssDiameter(tol, coachUnlocked);
    ring.style.width = d+'px';
    ring.style.height = d+'px';
  }
  // ALSO: sync notes
  syncTolNotesFromModel(id);
}

function syncTolNotesFromModel(id){
  const notes = getTargetNotes(currentSituation.key, id) || '';
  if (tolNotes) tolNotes.value = notes;
}

function setTolLive(id,tol){
  tol = clamp(Number(tol)||DEFAULT_TOL,5,400);
  let tgt = getTargetFor(currentSituation.key,id);
  if (!tgt){
    const pt = tokens.get(id)?.pos || getStartFor(currentSituation.key,id);
    setTargetFor(currentSituation.key,id,pt,tol);
    buildTargets();
  } else { tgt.tol = tol; }
  const ring = getRingEl(id);
  if (ring){
    const d=tolToCssDiameter(tol, coachUnlocked);
    ring.style.width=d+'px'; ring.style.height=d+'px';
    if (coachUnlocked) { ring.style.display='block'; ring.classList.add('show-label'); }
  }
  tolNum.value = tolRange.value = String(tol);
}

/* Kickoff */
if (img && img.complete) init();
else if (img){ img.addEventListener('load', init, { once:true }); window.addEventListener('load', ()=>{ if (!SITUATIONS.length) init(); }, { once:true }); }
/// @diq:end [A12] Init & events
else { window.addEventListener('load', init, { once:true }); }
