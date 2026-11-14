<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import {emptyHistory,recordHistory,stepHistory} from '$lib/plays/history.js';
  import {importBoardFile,exportBoardFile,boardFileName} from '$lib/plays/board-transfer.js';
  import PlayLibrary from '$lib/components/PlayLibrary.svelte';
  import { copyLibraryPlay } from '$lib/plays/library.js';
  let libraryOpen=$state(false), libraryReturnToMain=$state(false);
  function closeLibrary(){libraryOpen=false;if(!presenting&&(!hasEditor||libraryReturnToMain)){leaving=true;window.location.assign('/');return;}requestAnimationFrame(()=>document.getElementById(presenting?(presentationOrigin==='library'?'backToLibrary':'exitPresentation'):'browseLibrary')?.focus());}
  function browseLibrary(){playback?.pause();libraryReturnToMain=false;libraryOpen=true;}
  import brandLogo from '$lib/assets/diamond-defence-logo.png';
  import { throwArrowGeometry } from '$lib/plays/throws.js';
  import fieldImage from '$lib/assets/diamond-defense-soft-field.png';
  import { FIELDING_NUMBERS, tokenMetrics, createOffenseNumbers } from '$lib/plays/token-presentation.js';
  import { BASES_NATIVE, IMG_W, IMG_H } from '$lib/plays/field.js';
  import { newBoard, clone, POSITIONS, BALL_TYPES, hitFielding, cleanPath, fromSituation, toSituation, upgradeBoard } from '$lib/plays/board.js';
  import {RUN_RESULTS,hasCustomRunning,runningDestination,useAutomaticRunning} from '$lib/plays/running.js';
  import { MAX_STEPS, playSteps, hitStep, isAuthoredStep, movementStep, removeStep, stepMovementIndex, stepPositions, throwStep } from '$lib/plays/steps.js';
  import { throwLegs, MAX_SEGMENTS, segmentStart, reconcileSegments, eventOptions, conditionValue, parseCondition } from '$lib/plays/segments.js';
  import { situationDraft, situationPlayIssues, writeHandoff, readHandoff, clearHandoff } from '$lib/plays/authoring.js';
  import { presentationStatus } from '$lib/plays/presentation.js';
  import { compilePlay, frameAt, traveledPath, createPlayback, TEACHING_PLAYBACK_RATE, movementDuration } from '$lib/plays/animation.js';
  let {data} = $props();
  let hasEditor=$state(false);
  let board=$state(newBoard()), ballType=$state('ground_ball');
  let newHitResult=$state('');
  let stepId=$state(null), stepBall=$state(false), stepThrowFrom=$state(null), selectingThrow=$state(false);
  const steps=$derived(playSteps(board));
  const currentStep=$derived(steps.find(step=>step.id===stepId));
  const editingStep=$derived(!!currentStep);
  const alignment=$derived(!currentStep);
  let frame=$state(null), running=$state(false), message=$state(''), busy=$state(false);
  let boardId=$state(''), revision=$state(0);
  let field, tools, layout, playback,moreMenu;
  let movementEditor=$state(null), throwEditor=$state(null), ballEditor=$state(false);
  let drag=$state(null);
  let presenting=$state(false), presentationWidth=$state(800), presentationPlay=$state(null);
  let presentationOrigin=$state('board'), presentationReturn, previousOverflow='';
  let focusPlayers=$state([]), showTargets=$state(false), showMovementPaths=$state(false);
  const movementPaths=$derived.by(()=>{
    if(!presenting&&editingStep&&!savingSituation&&!frame){
      const routes=Object.entries(board.movements).flatMap(([id,segments])=>segments.flatMap((segment,index)=>
        movementStep(segment,index,steps)===stepId ? [{id,index,path:segment.path}] : []
      )).filter(route=>!focusPlayers.length||focusPlayers.includes(route.id));
      if(drag){const index=routes.findIndex(route=>route.id===drag.id&&route.index===drag.index);const active={id:drag.id,index:drag.index,path:cleanPath(drag.path)};if(index>=0)routes[index]=active;else routes.push(active);}
      return routes.filter(route=>route.path.length>1);
    }
    if(!showMovementPaths||!frame?.time)return [];try{const play=presenting?presentationPlay:compilePlay(board,{coachBoard:true});return play.tracks.filter(track=>POSITIONS.includes(track.id)&&(!focusPlayers.length||focusPlayers.includes(track.id))).map(track=>({id:track.id,index:track.index,path:traveledPath(track,frame.time)})).filter(route=>route.path.length>1);}catch{return [];}});
  const finalTargets=$derived.by(()=>{if(!showTargets)return [];try{const play=presenting?presentationPlay:compilePlay(board,{coachBoard:true});const final=frameAt(play,play.duration);return POSITIONS.filter(id=>!focusPlayers.length||focusPlayers.includes(id)).map(id=>[id,final.positions[id]]);}catch{return [];}});
  const teachingStatus=$derived(presentationStatus(presentationPlay,frame));
  function enterPresentation(origin='board'){
    try{
      presentationPlay=compilePlay(board,{coachBoard:true});
      presentationReturn={savingSituation};presentationOrigin=origin;
      stop();playback=createPlayback(presentationPlay,value=>frame=value,value=>running=value,{rate:TEACHING_PLAYBACK_RATE,reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches});
      playback.setSpeed(Number(speed));playback.restart();presenting=true;
      previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
      requestAnimationFrame(()=>document.getElementById(origin==='library'?'backToLibrary':'exitPresentation')?.focus());
      return true;
    }catch(e){message=e.message;return false;}
  }
  function exitPresentation(destination='editor'){
    stop();presenting=false;document.body.style.overflow=previousOverflow;
    savingSituation=presentationReturn?.savingSituation||false;
    if(destination==='library'){libraryReturnToMain=presentationOrigin==='library';libraryOpen=true;return;}
    if(presentationOrigin==='details'){
      try{writeHandoff(sessionStorage,data.userId,'details',linkedSituation,situationBaseline,rationale);leaving=true;window.location.assign('/');}catch(e){message=e.message;}
    }else requestAnimationFrame(()=>document.getElementById('presentBoard')?.focus());
  }
  function teach(action){if(action==='toggle'){if(running)playback.pause();else playback.play();}else if(action==='previous')playback.step(-1);else if(action==='next')playback.step(1);else playback.restart();}

  let savingSituation=$state(false), linkedSituation=$state(null), situationBaseline=$state(null), rationale=$state('');
  let cleanSnapshot=$state(''), pendingSituation=$state(false), leaving=false;
  function editorSnapshot(){return JSON.stringify({board,result,batterResult,outsRecorded,runnerResults,taggedUp,confirmed,rationale});}
  let history=$state(emptyHistory()),historyText=$state(false);
  $effect(()=>{
    if(!hasEditor||busy||drag||historyText)return;
    const next=recordHistory(history,editorSnapshot());if(next!==history)history=next;
  });
  function restoreSnapshot(snapshot){
    renameDraft=null;
    stop();const value=JSON.parse(snapshot);board=value.board;result=value.result;batterResult=value.batterResult;
    outsRecorded=value.outsRecorded;runnerResults=value.runnerResults;taggedUp=value.taggedUp;confirmed=value.confirmed;rationale=value.rationale;
    ballType=board.battedBall?.type||'ground_ball';
    if(!playSteps(board).some(step=>step.id===stepId))stepId=null;
    if(movementEditor&&!board.movements[movementEditor.id]?.[movementEditor.index])movementEditor=null;
    if(throwEditor&&!throwLegs(board).some(leg=>leg.index===throwEditor))throwEditor=null;
    if(hitStep(board)!==stepId)ballEditor=false;
    stepBall=false;
    selectingThrow=false;
  }
  function undoEdit(direction){
    if(busy||drag||presenting)return;
    history=recordHistory(history,editorSnapshot());const next=stepHistory(history,direction);
    if(next===history)return;history=next;restoreSnapshot(history.entries[history.index]);message=direction<0?'Edit undone.':'Edit restored.';
  }
  function textEditing(event,active){if(event.target.matches('input:not([type]),input[type=text],textarea'))historyText=active;}
  const dirty=$derived(pendingSituation||!!cleanSnapshot&&editorSnapshot()!==cleanSnapshot);
  function allowReplace(){return !dirty||window.confirm('Discard unsaved edits and open another play?');}
  function newPlay(){if(!allowReplace())return false;libraryReturnToMain=false;hasEditor=true;linkedSituation=null;situationBaseline=null;pendingSituation=false;rationale='';hydrate(newBoard());boardId='';revision=0;cleanSnapshot=editorSnapshot();message='New Board.';return true;}
  function restoreSituation(situation){linkedSituation=clone(situation);situationBaseline=clone(situation);pendingSituation=false;rationale='';hydrate(fromSituation(situation,{coachBoard:true}));boardId='';revision=0;cleanSnapshot=editorSnapshot();message='Situation loaded for editing. Changes save to the same Situation.';}
  function draftSituation(){return {...situationDraft(board,linkedSituation),...outcomeMetadata()};}

  function backToField(event){if(dirty&&!window.confirm('Leave without saving these edits?')){event.preventDefault();return;}leaving=true;}

  let metrics=$state(tokenMetrics(800,800*IMG_H/IMG_W));
  let throwSequence=$state('playSeq'), speed=$state(1);
  let confirmed=$state(false), result=$state('single'), batterResult=$state('first'), outsRecorded=$state(0), runnerResults=$state({}), taggedUp=$state({});
  const positions=$derived.by(()=>{
    if(frame)return frame.positions;
    const starts={...board.defenders,...board.runners};
    if(editingStep&&!savingSituation){
      const positions=stepPositions(board,stepId,steps);
      if(drag?.position)positions[drag.id]=drag.position;
      return positions;
    }
    return starts;
  });
  let recordingMovement=$state(false);
  const beforePitchStep=$derived(currentStep?.timing==='pre_pitch'||stepId==='pre_pitch');
  const canAddHit=$derived(!board.battedBall&&!beforePitchStep&&!stepThrows.length);
  const actionInProgress=$derived(recordingMovement||stepBall||selectingThrow||ballEditor||!!movementEditor||throwEditor!==null||!!drag);
  const canThrowAfterHit=$derived.by(()=>{
    const hit=hitStep(board,steps);
    return !!hit&&steps.findIndex(step=>step.id===stepId)>=steps.findIndex(step=>step.id===hit);
  });
  const runnersOnBase=$derived(['first','second','third'].some(base=>board.runners[base]));
  const stepThrows=$derived(throwLegs(board).filter(leg=>throwStep(board,leg.index,steps)===stepId));
  let stepPreview=$state(false);
  const stepMovements=$derived(Object.entries(board.movements).flatMap(([id,segments])=>
    segments.flatMap((segment,index)=>movementStep(segment,index,steps)===stepId?[{id,index}]:[])));
  const actionGroups=$derived.by(()=>{
    const groups=new Map();
    function add(cue,action){
      if(!groups.has(cue))groups.set(cue,[]);
      groups.get(cue).push(action);
    }
    const hitId=hitStep(board,steps);
    const hitIndex=steps.findIndex(step=>step.id===hitId);
    const legs=throwLegs(board);
    const firstAfterHit=hitId&&legs.find(leg=>{
      const index=steps.findIndex(step=>step.id===throwStep(board,leg.index,steps));
      return index>=hitIndex;
    });
    if(hitId===stepId)add('contact',{kind:'hit'});
    for(const action of stepMovements){
      const cue=conditionValue(board.movements[action.id][action.index],action.index);
      add(cue==='step'&&hitId===stepId?'contact':cue,{...action,kind:'move'});
    }
    for(const leg of stepThrows){
      const previous=legs[leg.index-2];
      const cue=!canThrowAfterHit&&!previous&&leg.from==='P'?'pre_pitch':!canThrowAfterHit&&!previous?'step':leg.index===firstAfterHit?.index||!previous
        ? 'ball_fielded':`throw_received:${previous.index}`;
      add(cue,{kind:'throw',leg});
    }
    const options=['step',...eventOptions(board,1).map(option=>option.value)];
    return [...groups].sort(([a],[b])=>options.indexOf(a)-options.indexOf(b));
  });
  function cueLabel(cue){
    if(cue==='step')return 'At step start';
    if(cue==='ball_fielded')return fieldingSummary?.fielder?`After ${fieldingSummary.fielder} ${fieldingSummary.caught?'catches':'fields'} the ball`:'After the ball is fielded';
    return eventOptions(board,1).find(option=>option.value===cue)?.label.replace(' (optional)','')||cue;
  }
  const ball=$derived(frame?.ball || board.battedBall?.destination);
  // Render the shared frame directly across delivery, contact, hit and throws.
  // A contact offset would jump forward and freeze until the flight caught up.
  const stepBallPosition=$derived.by(()=>{
    if(!currentStep)return null;
    if(!editingStep)return ball;
    const index=steps.findIndex(step=>step.id===stepId);
    const hitIndex=steps.findIndex(step=>step.id===hitStep(board,steps));
    const latest=throwLegs(board).filter(leg=>{
      const order=steps.findIndex(step=>step.id===throwStep(board,leg.index,steps));
      return order>=0&&order<=index;
    }).at(-1);
    return latest?positions[latest.to]:hitIndex>=0&&hitIndex<=index?ball:null;
  });
  const visibleBall=$derived((presenting||frame) ? (frame?.time>0?frame.ball:null) : stepBallPosition);
  async function request(url,options) {
    const response=await fetch(url,options);const value=await response.json();
    if(!response.ok) throw new Error(value.error || value.message || 'Request failed.');return value;
  }
  function stop(){playback?.dispose();playback=null;running=false;frame=null;stepPreview=false;}
  function edit(){stop();confirmed=false;}
  function showSituationForm(show){playback?.pause();savingSituation=show;if(tools)tools.scrollTop=0;}
  function resetActionEditors(){
    addStepOpen=false;
    recordingMovement=false;
    renameDraft=null;
    stop();
    movementEditor=null;
    throwEditor=null;
    ballEditor=false;
    stepBall=false;
    selectingThrow=false;
    stepThrowFrom=null;
  }
  const suggestedStepNames=['Before the pitch','Pitch','Contact','Field the ball','Cover and back up','Cutoff and relay','Throw to a base','Pickoff'];
  let renameDraft=$state(null), renameInput=$state(null), renameButton=$state(null);
  function selectStep(id){
    resetActionEditors();
    stepId=id;
  }
  let addStepOpen=$state(false);
  const canAddBeforePitch=$derived(!steps.some(step=>step.timing==='pre_pitch'||step.id==='pre_pitch'));
  function addStep(beforePitch=false){
    addStepOpen=false;
    const id=`step-${crypto.randomUUID()}`;
    const step=beforePitch?{id,name:'Before the pitch',timing:'pre_pitch'}:{id,name:`Step ${steps.length+2}`};
    board.steps=beforePitch?[step,...steps]:[...steps,step];
    selectStep(id);
  }
  function beginMovement(){
    resetActionEditors();
    recordingMovement=true;
  }
  async function beginRename(){
    stop();
    renameDraft=currentStep.name;
    await tick();
    renameInput?.focus();
    renameInput?.select();
  }
  async function finishRename(save){
    const name=renameDraft?.trim();
    if(save&&!name)return;
    if(save&&name!==currentStep.name)board.steps=steps.map(step=>step.id===stepId?{...step,name}:step);
    renameDraft=null;
    await tick();
    renameButton?.focus();
  }
  function deleteStep(){
    const lastStep=steps.length===1;
    removeStep(board,stepId);
    if(lastStep){
      changeRunningResult('single');
      ballType='ground_ball';
      outsRecorded=0;
      taggedUp={};
      throwSequence='playSeq';
    }else edit();
    selectStep(steps.at(-1)?.id||null);
    message=lastStep?'Step deleted. Starting alignment is ready for a new play.':'Step deleted. Any hit or throws were kept in the adjacent step.';
  }
  function beginThrow(pickoff=false){
    stop();
    selectingThrow=!selectingThrow;
    stepBall=false;
    ballEditor=false;
    movementEditor=null;
    throwEditor=null;
    if(pickoff)throwSequence='playSeq';
    else {
      const hitIndex=steps.findIndex(step=>step.id===hitStep(board,steps));
      const primary=throwLegs(board).filter(leg=>!leg.stage);
      if(primary.length&&primary.every(leg=>{
        const index=steps.findIndex(step=>step.id===throwStep(board,leg.index,steps));
        return index>=0&&index<hitIndex;
      }))throwSequence='playSeq2';
    }
    stepThrowFrom=board[throwSequence].at(-1)||(pickoff?'P':null);
  }
  function cleanMovement(segment,straighten){
    edit();
    segment.path=straighten?[segment.path[0],segment.path.at(-1)]:cleanPath(segment.path);
  }
  function chooseThrowFielder(id){
    if(!stepThrowFrom){stepThrowFrom=id;return;}
    if(stepThrowFrom===id)return;
    const sequence=board[throwSequence];
    const offset=throwSequence==='playSeq'?0:Math.max(0,board.playSeq.length-1);
    const insertAt=offset+Math.max(0,sequence.length-1);
    const lastThrow=sequence.length>1?throwStep(board,insertAt,steps):null;
    const nextThrow=throwSequence==='playSeq'&&board.playSeq2.length>1?throwStep(board,insertAt+1,steps):null;
    const selectedOrder=steps.findIndex(step=>step.id===stepId);
    if((lastThrow&&steps.findIndex(step=>step.id===lastThrow)>selectedOrder)||(nextThrow&&steps.findIndex(step=>step.id===nextThrow)<selectedOrder)){
      message='Choose a step that follows the order of the throw sequence.';
      return;
    }
    if(sequence.length&&sequence.at(-1)!==stepThrowFrom){
      message=`The next throw starts with ${sequence.at(-1)}.`;
      stepThrowFrom=sequence.at(-1);
      return;
    }
    if(sequence.length>=30){message='A sequence can contain up to 30 positions.';return;}
    const legs=throwLegs(board);
    const links=legs.map(leg=>throwStep(board,leg.index,steps));
    links.splice(insertAt,0,stepId);
    edit();
    board.steps=[...steps];
    board[throwSequence]=sequence.length?[...sequence,id]:[stepThrowFrom,id];
    board.throwSteps=links;
    shiftThrowEvents(insertAt+1,1);
    selectingThrow=false;
    stepThrowFrom=null;
  }
  function shiftThrowEvents(index,amount){
    for(const segments of Object.values(board.movements)){
      for(const segment of segments){
        if(segment.start?.throwIndex>=index)segment.start={...segment.start,throwIndex:segment.start.throwIndex+amount};
      }
    }
  }
  function openStepMovement(id,index,toggle=true){
    stop();
    stepBall=false;
    selectingThrow=false;
    movementEditor=toggle&&movementEditor?.id===id&&movementEditor.index===index?null:{id,index};
    ballEditor=false;
    throwEditor=null;
  }
  function editThrow(leg, endpoint, value){
    const key=leg.stage?'playSeq2':'playSeq';
    const offset=leg.stage?Math.max(0,board.playSeq.length-1):0;
    const index=leg.index-offset-(endpoint==='from'?1:0);
    edit();
    board[key][index]=value;
  }
  function deleteThrow(leg){
    const key=leg.stage?'playSeq2':'playSeq';
    const offset=leg.stage?Math.max(0,board.playSeq.length-1):0;
    const receiverIndex=leg.index-offset;
    if(board[key][receiverIndex+1]===leg.from){
      message='Delete the following throw first to keep the relay connected.';
      return;
    }
    const links=throwLegs(board).map(item=>throwStep(board,item.index,steps));
    edit();
    board.steps=[...steps];
    board[key].splice(leg.index-offset,1);
    if(board[key].length===1)board[key]=[];
    links.splice(leg.index-1,1);
    board.throwSteps=links;
    for(const segments of Object.values(board.movements)){
      for(const segment of segments){
        const index=segment.start?.throwIndex;
        if(index===leg.index)segment.start={event:segment.stepId?'step':'contact'};
        else if(index>leg.index)segment.start={...segment.start,throwIndex:index-1};
      }
    }
    throwEditor=null;
  }
  function hydrate(value){stop();focusPlayers=[];showTargets=false;showMovementPaths=false;savingSituation=false;resetActionEditors();stepId=null;board=upgradeBoard(value);board.runners.batter ||= clone(BASES_NATIVE.home);board.offenseNumbers ||= createOffenseNumbers();throwSequence='playSeq';ballType=board.battedBall?.type||'ground_ball';confirmed=false;runnerResults={};taggedUp={};result=board.running?.result==='out'?'groundout':board.running?.result||'single';batterResult=runningDestination(board,'batter');for(const id of ['first','second','third'].filter(id=>board.runners[id]))runnerResults[id]=runningDestination(board,id);outsRecorded=0;const outcome=board.situationMetadata?.playOutcome||board.sourceSituation?.playOutcome;if(outcome){confirmed=outcome.reviewStatus==='ready';result=outcome.result;batterResult=outcome.batterResult;outsRecorded=outcome.outsRecorded;}for(const r of board.situationMetadata?.runnerOutcomes||board.sourceSituation?.runnerOutcomes||[]){runnerResults[r.startingBase]=r.result;taggedUp[r.startingBase]=r.taggedUp;}history=emptyHistory();historyText=false;}
  onMount(()=>{
    hasEditor=!data.startInLibrary;
    const observer=new ResizeObserver(([entry])=>metrics=tokenMetrics(entry.contentRect.width,entry.contentRect.height));
    observer.observe(field);
    const layoutObserver=new ResizeObserver(([entry])=>presentationWidth=Math.max(0,Math.min(entry.contentRect.width,entry.contentRect.height*IMG_W/IMG_H)));layoutObserver.observe(layout);
    const presentationTransfer=readHandoff(sessionStorage,data.userId,'present');
    const transfer=presentationTransfer||readHandoff(sessionStorage,data.userId,'board');
    if(transfer){
      hasEditor=true;
      linkedSituation=clone(transfer.situation);situationBaseline=clone(transfer.baseline||transfer.situation);rationale=transfer.rationale||'';
      hydrate(fromSituation(transfer.situation,{coachBoard:true}));pendingSituation=!transfer.situation.revision||JSON.stringify(transfer.situation)!==JSON.stringify(situationBaseline);
      clearHandoff(sessionStorage);message='Situation draft restored. Changes save to the same Situation.';
    }
    cleanSnapshot=editorSnapshot();
    if(presentationTransfer)enterPresentation('details');
    else if(!transfer&&data.startInLibrary)libraryOpen=true;
    const dismissFocus=event=>{for(const picker of document.querySelectorAll('.focus-picker[open],.board-more[open]'))if(!picker.contains(event.target))picker.removeAttribute('open');};
    document.addEventListener('pointerdown',dismissFocus);
    const shortcuts=event=>{
      if(!presenting&&!libraryOpen&&!busy&&!drag&&(event.ctrlKey||event.metaKey)&&!event.altKey&&!event.target.closest('input,select,textarea,[contenteditable]')){
        if(event.key.toLowerCase()==='z'||event.ctrlKey&&event.key.toLowerCase()==='y'){event.preventDefault();undoEdit(event.shiftKey||event.key.toLowerCase()==='y'?1:-1);return;}
      }
      if(event.key==='Escape'){const picker=document.querySelector('.focus-picker[open],.board-more[open]');if(picker){event.preventDefault();picker.removeAttribute('open');picker.querySelector('summary')?.focus();return;}}
      if(!presenting||event.altKey||event.ctrlKey||event.metaKey)return;
      if(event.key==='Escape'){event.preventDefault();exitPresentation(presentationOrigin==='library'?'library':'editor');return;}
      if(event.target.closest('input,select,textarea')||(event.key===' '&&event.target.closest('button')))return;
      const action={ArrowLeft:'previous',ArrowRight:'next',' ':'toggle',r:'restart',R:'restart'}[event.key];if(action){event.preventDefault();teach(action);}
    };
    window.addEventListener('keydown',shortcuts);
    const beforeUnload=event=>{if(dirty&&!leaving){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',beforeUnload);
    return ()=>{document.removeEventListener('pointerdown',dismissFocus);observer.disconnect();layoutObserver.disconnect();window.removeEventListener('keydown',shortcuts);window.removeEventListener('beforeunload',beforeUnload);if(presenting)document.body.style.overflow=previousOverflow;};
  });
  onDestroy(()=>playback?.dispose());
  function point(event){const r=field.getBoundingClientRect();return {x:Math.max(0,Math.min(IMG_W,(event.clientX-r.left)/r.width*IMG_W)),y:Math.max(0,Math.min(IMG_H,(event.clientY-r.top)/r.height*IMG_H))};}
  function down(event,id){
    if(busy||savingSituation||presenting)return;
    if(editingStep&&selectingThrow&&POSITIONS.includes(id)){event.preventDefault();chooseThrowFielder(id);return;}
    if(stepBall){
      event.preventDefault();
      destination(event);
      return;
    }
    if(selectingThrow)return;
    if(!alignment&&!recordingMovement){selectTokenAction(id);return;}
    const segments=board.movements[id]||[];
    const index=editingStep?stepMovementIndex(segments,stepId,steps):0;
    if(editingStep&&segments.length>=MAX_SEGMENTS&&(!segments[index]||movementStep(segments[index],index,steps)!==stepId)){
      message='This token has reached its movement limit.';
      return;
    }
    const before=editorSnapshot();history=recordHistory(history,before);event.preventDefault();stop();
    const start=clone(alignment?board.defenders[id]||board.runners[id]:segmentStart(board,id,index));
    drag={before,id,index,pointer:event.pointerId,pointerStart:point(event),moved:false,path:[start]};event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event){if(!drag||event.pointerId!==drag.pointer)return;const p=point(event);
    if(!drag.moved&&Math.hypot(p.x-drag.pointerStart.x,p.y-drag.pointerStart.y)<12)return;
    drag.moved=true;
    if(alignment){if(board.defenders[drag.id])board.defenders[drag.id]=p;else board.runners[drag.id]=p;}
    else {const last=drag.path.at(-1);if(Math.hypot(p.x-last.x,p.y-last.y)>=8&&drag.path.length<4000)drag.path.push(p);drag.position=p;}
  }
  function up(event){if(!drag||event.pointerId!==drag.pointer)return;
    const endpoint=point(event);
    if(!drag.moved&&Math.hypot(endpoint.x-drag.pointerStart.x,endpoint.y-drag.pointerStart.y)<12){
      const id=drag.id;
      drag=null;
      frame=null;
      selectTokenAction(id);
      return;
    }
    confirmed=false;
    if(!alignment){
      drag.path.push(endpoint);
      const segments=board.movements[drag.id]||[];
      const existing=segments[drag.index];
      const path=cleanPath(drag.path);
      const replaces=existing&&movementStep(existing,drag.index,steps)===stepId;
      board.steps=[...steps];
      const action={...(replaces?existing:{}),path,stepId,start:replaces&&existing.start?existing.start:beforePitchStep?{event:'pre_pitch'}:isAuthoredStep(stepId)?{event:'step'}:parseCondition(stepId==='previous_movement'&&!drag.index?'contact':stepId)};
      segments.splice(drag.index,replaces?1:0,action);
      board.movements[drag.id]=segments;reconcileSegments(board,drag.id);
      if(drag.index<segments.length-1)message='Later movements reconnected to the new endpoint; preview them before saving.';
    }
    else {
      const alignment=board.defenders[drag.id]||board.runners[drag.id];
      alignment.x=endpoint.x;
      alignment.y=endpoint.y;
      if(board.movements[drag.id]){
        reconcileSegments(board,drag.id);
        message='Routes now start from the new alignment.';
      }
    }
    drag=null;frame=null;
  }
  function cancel(){if(drag)restoreSnapshot(drag.before);drag=null;frame=null;}
  function destination(event){
    if(busy||presenting||savingSituation||!stepBall)return;
    const existing=board.battedBall;
    if(!existing&&!RUN_RESULTS.includes(newHitResult))return;
    if(existing)edit();
    else changeRunningResult(newHitResult);
    board.steps=[...steps];
    board.battedBall={...existing,type:ballType,start:clone(BASES_NATIVE.home),destination:point(event),stepId};
    ballEditor=true;
    stepBall=false;
  }
  function runner(base,enabled){edit();if(enabled)board.runners[base]=clone(BASES_NATIVE[base==='batter'?'home':base]);else{delete board.runners[base];delete board.movements[base];}runnerResults[base]=runningDestination(board,base);}
  function tokenClick(event,id){
    if(busy||presenting||savingSituation||event.detail!==0)return;
    if(editingStep&&selectingThrow&&POSITIONS.includes(id))chooseThrowFielder(id);
    else selectTokenAction(id);
  }
  function selectTokenAction(id){
    const action=stepMovements.find(action=>action.id===id);
    if(action)openStepMovement(action.id,action.index,false);
  }
  function previewStep(){
    if(stepPreview&&running){playback.pause();return;}
    if(stepPreview){playback.play();return;}
    stop();
    try{
      const play=compilePlay(board,{coachBoard:true});
      const ranges=[];
      const authored=play.authoredTimeline?.find(step=>step.id===stepId);
      if(authored&&isAuthoredStep(stepId))ranges.push(authored);
      if(hitStep(board,steps)===stepId)ranges.push({start:play.contactTime,end:play.fieldingTime});
      for(const track of play.tracks){
        if(stepMovements.some(action=>action.id===track.id&&action.index===track.index)||
          track.automatic&&hitStep(board,steps)===stepId)ranges.push({start:track.start,end:track.start+track.duration});
      }
      for(const leg of play.throws){
        if(stepThrows.some(action=>action.index===leg.index))ranges.push({start:leg.start,end:leg.start+leg.duration});
      }
      const startTime=Math.min(...ranges.map(range=>range.start));
      const endTime=Math.max(...ranges.map(range=>range.end));
      if(!(endTime>startTime)){message='Record an action with movement before previewing this step.';return;}
      resetActionEditors();
      stepPreview=true;
      playback=createPlayback(play,value=>frame={...value,activeStep:stepId},value=>running=value,{
        startTime,endTime,rate:TEACHING_PLAYBACK_RATE,
        reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches
      });
      playback.setSpeed(Number(speed));
      playback.play();
    }catch(error){message=error.message;}
  }
  function changeRunningResult(value){
    edit();board.running={result:value,destinations:{}};
    result=value==='out'?'groundout':value;batterResult=runningDestination(board,'batter');
    for(const id of ['first','second','third'].filter(id=>board.runners[id]))runnerResults[id]=runningDestination(board,id);
  }
  function changeRunningDestination(id,value){
    edit();board.running ||= {result:'single',destinations:{}};board.running.destinations[id]=value;
    if(id==='batter')batterResult=value;else runnerResults[id]=value;
  }
  function deleteMovement(actor,index){edit();const segments=board.movements[actor]||[];segments.splice(index,1);
    if(segments.length){board.movements[actor]=segments;reconcileSegments(board,actor);if(segments[0].start?.event==='previous_movement')segments[0].start={event:'contact'};}
    else delete board.movements[actor];movementEditor=null;message='Movement deleted. Remaining routes reconnected; preview before saving.';
  }
  function changeTiming(segment,value){edit();if(value==='automatic')delete segment.durationMs;else segment.durationMs=Math.max(250,movementDuration(segment));}
  function changeDuration(segment,event){
    if(!event.currentTarget.reportValidity())return;
    const duration=Math.round(Number(event.currentTarget.value)*1000*TEACHING_PLAYBACK_RATE);
    if(duration<250||duration>30000)return;edit();segment.durationMs=duration;
  }
  const fieldingSummary=$derived.by(()=>{try{return compilePlay(board,{coachBoard:true});}catch{return null;}});
  function controls(){if(stepPreview)stop();if(!playback){const play=compilePlay(board,{coachBoard:true});playback=createPlayback(play,value=>frame=value,value=>running=value,{rate:TEACHING_PLAYBACK_RATE,reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches});frame=frameAt(play,0);playback.setSpeed(Number(speed));}return playback;}
  function playbackAction(action){try{const controller=controls();controller[action]();}catch(e){message=e.message;}}
  function previewIssues(){try{compilePlay(board,{coachBoard:true});return '';}catch(e){return e.message;}}
  async function save(){busy=true;try{const issues=previewIssues();if(issues)throw new Error(issues);board.situationMetadata=outcomeMetadata();const value=await request('/api/boards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:boardId||undefined,revision,board})});boardId=value.id;revision=value.revision;if(!linkedSituation){pendingSituation=false;cleanSnapshot=editorSnapshot();}if(history.index>=0)history.entries[history.index]=editorSnapshot();message='Board saved.';}catch(e){message=e.message;}finally{busy=false;}}
  function outcomeMetadata(){
    const original=linkedSituation||board.sourceSituation||board.situationMetadata||{};
    const runnerOutcomes=['first','second','third'].filter(base=>board.runners[base]).map(base=>{
      const previous=original.runnerOutcomes?.find(r=>r.startingBase===base)||{};
      const value=runnerResults[base]||'hold';
      const outcome={...previous,startingBase:base,result:value,taggedUp:!!taggedUp[base]};
      if(value==='out')outcome.outType=previous.outType||'other';else{delete outcome.outType;delete outcome.outOrder;}
      return outcome;
    });
    const playOutcome={...original.playOutcome,result,batterResult,outsRecorded:Number(outsRecorded),reviewStatus:confirmed?'ready':'needs_review'};
    if(batterResult==='out')playOutcome.batterOutType=original.playOutcome?.batterOutType||'other';else{delete playOutcome.batterOutType;delete playOutcome.batterOutOrder;}
    return {playOutcome,runnerOutcomes,batterAdvance:{out:0,first:1,second:2,third:3,home:4}[batterResult]};
  }
  async function publish(){busy=true;try{const issues=previewIssues();if(issues)throw new Error(issues);
    if(linkedSituation){
      if(linkedSituation.hit&&!board.battedBall)throw new Error('Set the batted-ball destination before publishing.');
      const situation=draftSituation();
      const invalid=situationPlayIssues(situation);if(invalid.length)throw new Error(invalid.map(issue=>issue.message).join('\n'));
      let value;
      if(data.canPublish){
        const creating=!Number.isInteger(Number(situation.revision))||Number(situation.revision)<1;
        if(data.role==='coach'&&!creating){
          const usage=await request(`/api/situations/${encodeURIComponent(situation.key)}/usage`);
          if(!window.confirm(`Publish changes to the shared Situation? Team Playbooks using it: ${(usage.teams||[]).map(t=>t.name).join(', ')||'None'}.`))return;
        }
        value=await request(creating?'/api/situations':`/api/situations/${encodeURIComponent(situation.key)}`,{method:creating?'POST':'PUT',headers:{'Content-Type':'application/json',...(creating?{}:{'If-Match':String(situation.revision)})},body:JSON.stringify(situation)});
        linkedSituation=clone(value.record);situationBaseline=clone(value.record);board.sourceSituation=clone(value.record);pendingSituation=false;cleanSnapshot=editorSnapshot();
        history=emptyHistory();message='Situation changes saved.';
      }else{
        if(!rationale.trim())throw new Error('Add a short reason for the proposal.');
        await request('/api/situation-submissions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({situation,rationale})});
        openSituationAfterSubmission();message='Proposal submitted. Players still use the published version.';
      }
    }else{
      const situation=toSituation(board,{desc:board.sourceSituation?.desc||'',category:board.sourceSituation?.category||'Coach Board',difficulty:board.sourceSituation?.difficulty||'foundational',primaryCategory:board.sourceSituation?.primaryCategory||'base-coverage',relatedCategories:board.sourceSituation?.relatedCategories||[],...outcomeMetadata()});
      const value=await request('/api/situations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(situation)});
      linkedSituation=clone(value.record);situationBaseline=clone(value.record);board.sourceSituation=clone(value.record);pendingSituation=false;cleanSnapshot=editorSnapshot();
      history=emptyHistory();message=`Situation ${value.record.displayCode || value.record.title} created.`;
    }
  }catch(e){message=e.message;}finally{busy=false;}}
  function openSituationAfterSubmission(){const restored=situationBaseline||linkedSituation;hydrate(fromSituation(restored,{coachBoard:true}));linkedSituation=clone(restored);pendingSituation=false;rationale='';cleanSnapshot=editorSnapshot();}
  function restoreBoard(item){linkedSituation=null;situationBaseline=null;pendingSituation=false;rationale='';hydrate(item.board);boardId=item.id;revision=item.revision;cleanSnapshot=editorSnapshot();message='Board loaded.';}
  function importBoard(text){
    const imported=importBoardFile(text);if(!allowReplace())return false;
    if(presenting)exitPresentation();
    hasEditor=true;libraryReturnToMain=false;
    restoreBoard({board:imported,id:'',revision:0});pendingSituation=true;
    message='Board imported as a new draft. Review its name and play, then Save Board.';return true;
  }
  function moreAction(action){if(moreMenu)moreMenu.open=false;action();}
  function boardCopy(){
    const name=window.prompt('Name for the new Board copy',`${board.title.slice(0,110)} copy`);if(!name?.trim())return;if(name.trim().length>120){message='Enter a Board name of 1–120 characters.';return;}
    const copy=clone(board);copy.title=name.trim();copy.sourceSituation=null;copy.situationMetadata=outcomeMetadata();
    linkedSituation=null;situationBaseline=null;hydrate(copy);boardId='';revision=0;pendingSituation=true;cleanSnapshot=editorSnapshot();
    message='Independent Board copy opened. Save Board when ready.';
  }
  function exportBoard(){
    try{
      const text=exportBoardFile({...board,situationMetadata:outcomeMetadata()});
      const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download=boardFileName(board.title);link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);message='Board exported.';
    }catch(error){message=error.message;}
  }
  async function libraryAction(item,action,name){
    if(action==='new')return newPlay();
    if(!allowReplace())return false;
    const record=await request(`/api/play-library/${item.type}/${encodeURIComponent(item.id)}`);
    hasEditor=true;libraryReturnToMain=action==='present';
    if(action==='duplicate'){
      const copy=copyLibraryPlay(item.type,item.type==='board'?record.board:record,name,`copy-${crypto.randomUUID()}`);
      if(item.type==='board'){restoreBoard({board:copy,id:'',revision:0});pendingSituation=true;}
      else{linkedSituation=clone(copy);situationBaseline=null;rationale='';hydrate(fromSituation(copy,{coachBoard:true}));boardId='';revision=0;pendingSituation=true;cleanSnapshot=editorSnapshot();}
      message='Independent copy opened. Save or publish this draft when ready.';
      return true;
    }
    if(item.type==='board')restoreBoard(record);
    else restoreSituation(record);
    if(action==='present'&&!enterPresentation('library'))throw new Error(message);
    return true;
  }

  async function deleteBoard(){
    if(!window.confirm(`Delete Board “${board.title}”? This cannot be undone.`))return;
    busy=true;
    try{
      await request(`/api/play-library/board/${encodeURIComponent(boardId)}`,{method:'DELETE',headers:{'If-Match':String(revision)}});
      hydrate(newBoard());
      boardId='';
      revision=0;
      pendingSituation=false;
      cleanSnapshot=editorSnapshot();
      hasEditor=false;
      libraryOpen=true;
    }catch(error){
      message=error.message;
    }finally{
      busy=false;
    }
  }
  async function archiveSituation(){
    busy=true;try{
      const usage=await request(`/api/situations/${encodeURIComponent(linkedSituation.key)}/usage`);
      if(!window.confirm(`Archive Situation “${linkedSituation.title}”? Team Playbooks using it: ${(usage.teams||[]).map(team=>team.name).join(', ')||'None'}. Existing history is retained; the open draft will remain available.`))return;
      await request(`/api/situations/${encodeURIComponent(linkedSituation.key)}`,{method:'DELETE',headers:{'If-Match':String(linkedSituation.revision)}});
      const copy=copyLibraryPlay('situation',draftSituation(),board.title,`copy-${crypto.randomUUID()}`);linkedSituation=copy;situationBaseline=null;board.sourceSituation=clone(copy);pendingSituation=true;message='Situation archived. The open draft can be published as a new Situation.';
    }catch(e){message=e.message;}finally{busy=false;}
  }

</script>

<svelte:head><title>Coach Board — Diamond Defence</title></svelte:head>
{#snippet teachingTools()}
  <div class="teaching-tools" role="group" aria-label="Teaching views">
    <details class="focus-picker"><summary>Focus: {focusPlayers.length?focusPlayers.join(', '):'All Players'}</summary><div class="focus-options" role="group" aria-label="Focus positions"><button onclick={()=>focusPlayers=[]}>All Players</button>{#each POSITIONS as id}<label><input type="checkbox" value={id} bind:group={focusPlayers} />{id}</label>{/each}</div></details>
    <label><input type="checkbox" bind:checked={showTargets} /> Show Targets</label>
    <label><input type="checkbox" bind:checked={showMovementPaths} /> Show Movement Paths</label>
  </div>
{/snippet}
<main hidden={!hasEditor} class="board-workspace" class:presentation={presenting}>
  <header class="board-header"><div class="board-brand"><img src={brandLogo} alt="" /><div><h1>{presenting?board.title:'Coach Board'}</h1><p>{presenting?'Coach Presentation':'Design and demonstrate the correct baseball play.'}</p></div></div>{#if presenting}<div class="presentation-navigation">{#if presentationOrigin!=='library'}<button id="exitPresentation" class="board-return" onclick={()=>exitPresentation()}>Exit Presentation</button>{/if}<button id="backToLibrary" class="board-return" onclick={()=>exitPresentation('library')}>Back to Library</button></div>{:else}<div class="presentation-navigation"><button id="browseLibrary" class="board-return" aria-label="Back to Library" onclick={browseLibrary}>Back to Library</button><a class="board-return" href="/" data-sveltekit-reload onclick={backToField}>Back to field</a></div>{/if}</header>
  <div class="board-layout" bind:this={layout}>
  <div class="field-workspace" inert={busy}>
  {#if !presenting&&!savingSituation}
  <section class="board-controls playback-controls" aria-label="Playback controls">
    <div class="preview-main"><button onclick={()=>running&&!stepPreview?playback.pause():playbackAction('play')}>{running&&!stepPreview?'Pause':'Preview'}</button><button onclick={()=>playbackAction('restart')}>Replay</button><button id="presentBoard" onclick={()=>enterPresentation()}>Present</button></div>
    {#if editingStep&&(stepMovements.length||stepThrows.length||hitStep(board)===stepId)}
      <button onclick={previewStep}>{stepPreview&&running?'Pause step':'Preview this step'}</button>
    {/if}
    <label>Speed <select bind:value={speed} onchange={()=>playback?.setSpeed(Number(speed))}>{#each [0.5,1,2] as value}<option value={value}>{value}×</option>{/each}</select></label>
    <details class="preview-options"><summary>Preview options</summary><div class="button-row"><button onclick={()=>{try{controls().step(-1);}catch(e){message=e.message;}}}>Previous Step</button><button onclick={()=>{try{controls().step(1);}catch(e){message=e.message;}}}>Next Step</button></div>{@render teachingTools()}</details>
  </section>
  {#if editingStep}
    <p class="field-instruction" style:visibility={frame?'hidden':undefined}>{stepBall
      ? (board.battedBall||newHitResult?'Tap the field to place the batted ball.':'Choose a hit result in the sidebar.')
      : selectingThrow
        ? (stepThrowFrom?`Choose a receiver for ${stepThrowFrom}.`:'Choose the throwing fielder.')
        : recordingMovement?'Drag a fielder or runner to record a move.':'Choose Add movement to record a route.'}</p>
  {/if}
  {/if}
  <div class="board-field" style:width={presenting?`${presentationWidth}px`:undefined} bind:this={field} role="group" aria-label="Baseball play field">
    <img src={fieldImage} alt="Baseball field" draggable="false" />
    <button class="field-surface" aria-label="Set batted-ball destination" tabindex={presenting||!stepBall||(!board.battedBall&&!newHitResult)?-1:0} aria-disabled={presenting||!stepBall||(!board.battedBall&&!newHitResult)} onclick={destination}></button>
    <svg class="board-throws" viewBox={`0 0 ${IMG_W} ${IMG_H}`} aria-hidden="true">
      {#if movementPaths.length}{#each movementPaths as route (`${route.id}-${route.index}`)}<path class="board-movement-path" class:route-selected={movementEditor?.id===route.id&&movementEditor.index===route.index} data-position={route.id} d={route.path.map((p,i)=>`${i?'L':'M'} ${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--field-movement-path)" stroke-width="8" stroke-dasharray="1 20" stroke-linecap="round" style="filter:drop-shadow(0 1px 2px #071722)" opacity="0.85" />{/each}{/if}
      {#if frame?.hitTrail?.length}
        <g class="board-hit-path">
          {#each frame.hitTrail.slice(1) as point,i}
            {@const previous=frame.hitTrail[i]}
            <path d={`M ${previous.x} ${previous.y} L ${point.x} ${point.y}`}
              fill="none" stroke="var(--field-hit-path)" stroke-width={board.battedBall.type==='line_drive'?5:8}
              stroke-linecap="round" opacity={(i+1)*0.085}
              style:display={board.battedBall.type==='ground_ball'&&i%2?'none':undefined} />
          {/each}
        </g>
      {/if}
      {#if frame?.ballShadow}
        <ellipse class="board-ball-shadow" cx={frame.ballShadow.x} cy={frame.ballShadow.y} rx="24" ry="10" fill="#060e16" opacity="0.55" />
      {/if}
      {#each frame?.arrows || [] as arrow}
        {@const route = throwArrowGeometry(arrow, undefined, 2.5)}
        <path class="seq-route-underlay" d={route.shaft} />
        <path class="seq-route-active" d={route.shaft} />
        <path class="seq-route-head" d={route.head} />
      {/each}
    </svg>
    {#each finalTargets as [id,p] (id)}<span class="ghost-target" style:left={`${p.x/IMG_W*100}%`} style:top={`${p.y/IMG_H*100}%`} style:width={`${metrics.defender}px`} style:height={`${metrics.defender}px`} style:font-size={`${metrics.defenderFont}px`} aria-label={`${id} final target`}>{id}</span>{/each}
    {#each Object.entries(positions) as [id,p] (id)}<button class:board-runner={!POSITIONS.includes(id)} class:movement-ready={recordingMovement&&!presenting&&!frame} class={`board-token ${POSITIONS.includes(id)?'chip '+(['P','C'].includes(id)?'Battery':['LF','CF','RF'].includes(id)?'Outfield':'Infield'):'baseRunner'}`} class:chosen={!presenting&&(movementEditor?.id===id||selectingThrow&&stepThrowFrom===id)} class:teaching-focus={focusPlayers.includes(id)} class:teaching-secondary={!!focusPlayers.length&&POSITIONS.includes(id)&&!focusPlayers.includes(id)} data-fielding-number={FIELDING_NUMBERS[id]} style:width={`${POSITIONS.includes(id)?metrics.defender:metrics.runner}px`} style:height={`${POSITIONS.includes(id)?metrics.defender:metrics.runner}px`} style:font-size={`${metrics.defenderFont}px`} style:left={`${p.x/IMG_W*100}%`} style:top={`${p.y/IMG_H*100}%`} aria-label={`${id} token`} tabindex={presenting?-1:0} aria-disabled={presenting} onpointerdown={e=>down(e,id)} onpointermove={move} onpointerup={up} onpointercancel={cancel} onclick={e=>tokenClick(e,id)}>{#if POSITIONS.includes(id)}{id}{:else}<span class="rlabel" style:font-size={`${metrics.runnerFont}px`}>{board.offenseNumbers[id]}</span>{/if}</button>{/each}
    {#if frame?.fieldingLabel}
      <span class="fielding-label">{frame.fieldingLabel}</span>
    {/if}
    {#if visibleBall}
      {@const left=`${visibleBall.x/IMG_W*100}%`}
      {@const top=`${visibleBall.y/IMG_H*100}%`}
      {#if !presenting&&!frame&&!savingSituation&&hitStep(board)===stepId&&!selectingThrow}
        <button class="ball-edit-target" aria-label="Edit batted ball" style:left style:top
          style:width={`${Math.max(28,metrics.ball)}px`} style:height={`${Math.max(28,metrics.ball)}px`}
          onclick={()=>{stop();ballEditor=true;stepBall=true;selectingThrow=false;}}></button>
      {/if}
      <span class="ball board-ball" style:left style:top style:scale={frame?.scale||1}
        style:width={`${metrics.ball}px`} style:height={`${metrics.ball}px`}
        style:box-shadow={`0 0 0 ${metrics.ballOutline}px var(--field-ball-edge), 0 1px ${metrics.ballShadow}px rgba(0,0,0,.35)`}
        aria-label="Baseball"></span>
    {/if}
  </div>
  </div>
    <aside inert={busy} hidden={presenting} class="card board-tools" aria-label="Coach Board tools" bind:this={tools} onfocusin={e=>textEditing(e,true)} onfocusout={e=>textEditing(e,false)}>
      <section class="board-controls board-save" aria-label="Board details">
        <label>Board name <input disabled={busy} maxlength="120" bind:value={board.title} /></label>
        <p class="save-status">{linkedSituation?`Editing ${linkedSituation.displayCode||linkedSituation.key} · `:''}{!boardId&&!linkedSituation?'New Board · Not saved':dirty?'Unsaved changes':'Saved'}</p>
        <div class="save-actions"><button class="save-board" disabled={busy} onclick={()=>linkedSituation?showSituationForm(true):save()}>{linkedSituation?'Save Situation Changes':'Save Board'}</button>
          <details class="board-more" bind:this={moreMenu}><summary aria-label="More actions">More ⋯</summary><div class="more-options">
            <button onclick={()=>moreAction(exportBoard)}>Export Board</button>
            {#if linkedSituation}<button onclick={()=>moreAction(boardCopy)}>Save a Board Copy</button>{:else if data.canPublish}<button onclick={()=>moreAction(()=>showSituationForm(true))}>Save as Situation</button>{/if}
            {#if boardId}<button onclick={()=>moreAction(deleteBoard)}>Delete Board</button>{/if}
            {#if linkedSituation?.revision&&data.role==='admin'}<button onclick={()=>moreAction(archiveSituation)}>Archive Situation</button>{/if}
          </div></details>
        </div>
      </section>
      <div class="editing-toolbar">
        {#if savingSituation}
          <h2>Outcomes</h2>
        {:else}
          <h2>Steps</h2>

        {/if}
        <div class="edit-history" role="group" aria-label="Edit history"><button aria-label="Undo" title="Undo (Cmd/Ctrl+Z)" disabled={busy||!!drag||history.index<=0&&(!historyText||history.entries[history.index]===editorSnapshot())} onclick={()=>undoEdit(-1)}>↶</button><button aria-label="Redo" title="Redo (Cmd/Ctrl+Shift+Z)" disabled={busy||!!drag||history.index>=history.entries.length-1||historyText&&history.entries[history.index]!==editorSnapshot()} onclick={()=>undoEdit(1)}>↷</button></div></div>
  {#if savingSituation}
  <section class="conversion" id="situation-conversion" aria-label="Save Situation options"><div class="conversion-heading"><h2>{linkedSituation?'Save Situation Changes':'Save as Situation'}</h2><button onclick={()=>showSituationForm(false)}>Back to Board Tools</button></div><p>Final defender positions become correctness targets. Movement curves remain instructional metadata.</p>
    <div class="board-controls"><label>Play result <select bind:value={result} onchange={()=>confirmed=false}>{#each ['single','double','triple','home_run','ground_rule_double','groundout','caught_fly','caught_line','sacrifice_bunt','squeeze_bunt','sacrifice_fly','fielders_choice','double_play','error','other'] as value}<option value={value}>{value.replaceAll('_',' ')}</option>{/each}</select></label>
    <label>Batter result <select bind:value={batterResult} onchange={()=>confirmed=false}>{#each ['out','first','second','third','home'] as value}<option value={value}>{value}</option>{/each}</select></label>
    <label>Outs recorded <select bind:value={outsRecorded} onchange={()=>confirmed=false}>{#each [0,1,2,3] as value}<option value={value}>{value}</option>{/each}</select></label>
    {#each ['first','second','third'].filter(base=>board.runners[base]) as base}<label>Runner on {base}<select bind:value={runnerResults[base]} onchange={()=>confirmed=false}>{#each ['hold','second','third','home','out'] as value}<option value={value}>{value}</option>{/each}</select></label><label><input type="checkbox" bind:checked={taggedUp[base]} onchange={()=>confirmed=false} /> Runner on {base} tagged up</label>{/each}
    <label><input type="checkbox" bind:checked={confirmed} /> I confirm these play and runner outcomes</label>{#if linkedSituation&&!data.canPublish}<label>Proposal reason <textarea bind:value={rationale}></textarea></label>{/if}<button disabled={busy} onclick={publish}>{linkedSituation?(data.canPublish?'Publish Situation':'Submit for Review'):'Create Situation'}</button></div>
  </section>
  {:else}

  <section class="steps-sidebar" aria-label="Play steps">
    <ol>
      <li><button aria-current={frame?.activeStep?undefined:stepId===null?'step':undefined} onclick={()=>selectStep(null)}>Starting alignment</button></li>
      {#each steps as step (step.id)}
        <li><button aria-current={(frame?.activeStep||stepId)===step.id?'step':undefined} onclick={()=>selectStep(step.id)}>{step.name}</button></li>
      {/each}
    </ol>
    <button class="add-step" disabled={steps.length>=MAX_STEPS} aria-expanded={addStepOpen}
      aria-controls={addStepOpen?'add-step-choices':undefined} onclick={()=>addStepOpen=!addStepOpen}>+ Add Step</button>
    {#if addStepOpen}
      <div id="add-step-choices" class="step-choices" role="group" aria-label="Step presets">
        <button onclick={()=>addStep()}>Blank step</button>
        {#if canAddBeforePitch}<button onclick={()=>addStep(true)}>Before the pitch</button>{/if}
      </div>
    {/if}
  </section>
  <section class="board-controls mode-controls" aria-label="Selected step controls">
    {#if alignment}
      <p>Drag fielders to set their starting positions.</p><label>Outs <select bind:value={board.outs} onchange={edit}>{#each [0,1,2] as n}<option value={n}>{n}</option>{/each}</select></label>
      <fieldset class="starting-runners">
        <legend>Runners on base</legend>
        {#each ['first','second','third'] as base}<label><input type="checkbox" checked={!!board.runners[base]} onchange={e=>runner(base,e.currentTarget.checked)} /> {base}</label>{/each}
      </fieldset>
    {:else if editingStep}
      {#key currentStep.id}
      <div class="step-heading">
        {#if renameDraft===null}
          <h2>{currentStep.name}</h2>
          <button class="rename-step" bind:this={renameButton} onclick={beginRename}>Rename</button>
        {:else}
          <form class="step-rename-form" onsubmit={event=>{event.preventDefault();finishRename(true);}}>
            <label>Step name <input bind:this={renameInput} bind:value={renameDraft} maxlength="80" required
              onkeydown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finishRename(false);}}} /></label>
            <label>Suggested names
              <select value={suggestedStepNames.includes(renameDraft)?renameDraft:''}
                onchange={event=>{if(event.currentTarget.value)renameDraft=event.currentTarget.value;}}>
                <option value="" disabled>Choose a suggestion</option>
                {#each suggestedStepNames as name}<option value={name}>{name}</option>{/each}
              </select>
            </label>
            <div class="button-row">
              <button type="submit" disabled={!renameDraft.trim()}>Apply name</button>
              <button type="button" onclick={()=>finishRename(false)}>Cancel</button>
            </div>
          </form>
        {/if}
        {#if renameDraft===null}
        <details class="step-options board-more">
          <summary aria-label="Step options">⋯</summary>
          <div class="more-options">
            <button onclick={deleteStep}>Delete Step</button>
          </div>
        </details>
        {/if}
      </div>
      {/key}
      {#if recordingMovement}
        <button onclick={()=>recordingMovement=false}>Done moving</button>
      {/if}
      {#if !actionInProgress}
      <h3 class="step-section-label">Add to this step</h3>
      <div class="button-row">
                <button onclick={beginMovement}>Add movement</button>
        {#if !canThrowAfterHit&&runnersOnBase}<button onclick={()=>beginThrow(true)}>Add pickoff throw</button>{/if}
        {#if canAddHit}<button aria-pressed={stepBall} onclick={()=>{stop();stepBall=!stepBall;newHitResult='';selectingThrow=false;ballEditor=false;movementEditor=null;throwEditor=null;}}>Set batted ball</button>{/if}
        {#if canThrowAfterHit}<button aria-pressed={selectingThrow} onclick={()=>beginThrow()}>Add throw</button>{/if}
      </div>
      {/if}
      {#if stepBall}
        <button onclick={()=>stepBall=false}>Cancel ball placement</button>
        <label>Batted-ball type <select bind:value={ballType}>{#each BALL_TYPES as type}<option value={type}>{type.replaceAll('_',' ')}</option>{/each}</select></label>
        {#if !board.battedBall}
          <label>Hit result <select required bind:value={newHitResult}>
            <option value="" disabled>Choose a result</option>
            {#each RUN_RESULTS as value}<option value={value}>{value.replaceAll('_',' ')}</option>{/each}
          </select></label>
          {#if newHitResult}
            <p class="runner-suggestions">
              {['batter','first','second','third'].filter(id=>board.runners[id]&&!hasCustomRunning(board,id)).map(id=>
                `${id==='batter'?'Batter':`Runner on ${id}`} → ${runningDestination({running:{result:newHitResult}},id)}`).join(' · ')}
            </p>
          {/if}
        {/if}
      {:else if selectingThrow}
        {#if canThrowAfterHit}<label>Throw sequence <select bind:value={throwSequence} onchange={()=>stepThrowFrom=board[throwSequence].at(-1)||null}><option value="playSeq">Primary</option><option value="playSeq2">Secondary</option></select></label>{/if}
        <p>{stepThrowFrom?`Choose the receiver for ${stepThrowFrom}'s throw.`:'Choose the throwing fielder.'}</p>
        <button onclick={()=>selectingThrow=false}>{canThrowAfterHit?'Cancel throw':'Cancel pickoff'}</button>
      {/if}
      {#if stepMovements.length||stepThrows.length||hitStep(board)===stepId}
      <h3 class="step-section-label">Recorded actions</h3>
      <div class="action-groups">
        {#each actionGroups as [cue,actions] (cue)}
          <section class="action-group" aria-label={cueLabel(cue)}>
            <h4>{cueLabel(cue)}</h4>
            <ul class="step-actions">
              {#each actions as action (action.kind==='move'?`move:${action.id}:${action.index}`:action.kind==='throw'?`throw:${action.leg.index}`:'hit')}
                {#if action.kind==='hit'}
          <li class:action-open={ballEditor}>
            <button aria-expanded={ballEditor} onclick={()=>{stop();ballEditor=!ballEditor;movementEditor=null;throwEditor=null;}} aria-label="Batted ball"><span><strong>Batted ball</strong><small>{board.battedBall.type.replaceAll('_',' ')} · {(board.running?.result||'single').replaceAll('_',' ')}</small></span><span class="action-edit">{ballEditor?'Done':'Edit'}</span></button>
            {#if ballEditor}
              <div class="board-controls inline-fields">
                {#if !stepBall}<label>Batted-ball type <select bind:value={ballType} onchange={()=>{edit();board.battedBall.type=ballType;}}>{#each BALL_TYPES as type}<option value={type}>{type.replaceAll('_',' ')}</option>{/each}</select></label>{/if}
                <label>How it’s fielded <select value={hitFielding(board.battedBall)} onchange={e=>{edit();board.battedBall.fielding=e.currentTarget.value;}}>
                  <option value="caught">Caught in the air</option>
                  <option value="ground">Fielded on the ground</option>
                </select></label>
                <label>Ball fielder <select value={board.battedBall.fielder||''} onchange={e=>{edit();if(e.currentTarget.value)board.battedBall.fielder=e.currentTarget.value;else delete board.battedBall.fielder;}}><option value="">Nearest fielder</option>{#each POSITIONS as id}<option value={id}>{id}</option>{/each}</select></label>
                <button aria-pressed={stepBall} onclick={()=>{stop();stepBall=!stepBall;selectingThrow=false;}}>Move batted ball</button>
                {#if fieldingSummary?.fielder}<p>{fieldingSummary.fielder} {fieldingSummary.caught?'catches':'fields'} the ball after {((fieldingSummary.fieldingTime-fieldingSummary.contactTime)/(1000*TEACHING_PLAYBACK_RATE)).toFixed(1)} seconds from contact at Normal speed.</p>{/if}
                {#if fieldingSummary?.fieldingWarning}<p role="note">{fieldingSummary.fieldingWarning}</p>{/if}

      <label>Hit result <select value={board.running?.result||'single'} onchange={e=>changeRunningResult(e.currentTarget.value)}>{#each RUN_RESULTS as value}<option value={value}>{value.replaceAll('_',' ')}</option>{/each}</select></label>
      {#each ['batter','first','second','third'].filter(id=>board.runners[id]) as id}
        <label>{id==='batter'?'Batter destination':`Runner on ${id} destination`} <select id={`advance-${id}`} disabled={hasCustomRunning(board,id)} value={runningDestination(board,id)} onchange={e=>changeRunningDestination(id,e.currentTarget.value)}>{#each (id==='batter'?['first','second','third','home','out']:id==='first'?['hold','second','third','home','out']:id==='second'?['hold','third','home','out']:['hold','home','out']) as destination}<option value={destination}>{destination}</option>{/each}</select></label>
        {#if hasCustomRunning(board,id)}<p>{id}: Custom route</p><button onclick={()=>{edit();useAutomaticRunning(board,id);}}>Use automatic running for {id}</button>{/if}
      {/each}

              </div>
            {/if}
          </li>
                {:else if action.kind==='move'}
          {@const segment=board.movements[action.id][action.index]}
          {@const expanded=movementEditor?.id===action.id&&movementEditor.index===action.index}
          <li class:action-open={expanded}>
            <button aria-expanded={expanded} onclick={()=>openStepMovement(action.id,action.index)} aria-label={`${action.id} · Movement ${action.index+1}`}><strong>{action.id} · Movement {action.index+1}</strong><span class="action-edit">{expanded?'Done':'Edit'}</span></button>
            {#if expanded}
              <div class="board-controls inline-fields">
                <label>Start movement <select value={conditionValue(segment,action.index)} onchange={e=>{edit();board.steps=[...steps];segment.stepId=stepId;segment.start=parseCondition(e.currentTarget.value);}}>
                  {#if isAuthoredStep(stepId)}<option value="step">At the start of this step</option>{/if}
                  {#each eventOptions(board,action.index) as option}<option value={option.value}>{option.label}</option>{/each}
                </select></label>
                <label>Movement timing <select value={segment.durationMs===undefined?'automatic':'custom'} onchange={e=>changeTiming(segment,e.currentTarget.value)}><option value="automatic">Automatic</option><option value="custom">Custom duration</option></select></label>
                {#if segment.durationMs!==undefined}<label>Duration at Normal speed (seconds) <input type="number" min="1" max="120" step="0.1" value={segment.durationMs/(1000*TEACHING_PLAYBACK_RATE)} onchange={e=>changeDuration(segment,e)} /></label>{/if}
                <div class="button-row">
                  <button disabled={segment.path.length<3} onclick={()=>cleanMovement(segment,true)}>Straighten path</button>
                  <button disabled={segment.path.length<3} onclick={()=>cleanMovement(segment,false)}>Smooth curve</button>
                </div>
                <button onclick={()=>deleteMovement(action.id,action.index)}>Delete Movement</button>
              </div>
            {/if}
          </li>
                {:else}
                  {@const leg=action.leg}
          {@const key=leg.stage?'playSeq2':'playSeq'}
          {@const vertex=leg.index-(leg.stage?Math.max(0,board.playSeq.length-1):0)}
          <li class:action-open={throwEditor===leg.index}>
            <button aria-expanded={throwEditor===leg.index} onclick={()=>{stop();throwEditor=throwEditor===leg.index?null:leg.index;ballEditor=false;movementEditor=null;}} aria-label={`${leg.from} → ${leg.to}`}><span><strong>{!canThrowAfterHit&&leg.from==='P'?'Pickoff':'Throw'}</strong><small>{leg.from} → {leg.to}</small></span><span class="action-edit">{throwEditor===leg.index?'Done':'Edit'}</span></button>
            {#if throwEditor===leg.index}
              <div class="board-controls inline-fields">
                <label>Thrower <select value={leg.from} onchange={e=>editThrow(leg,'from',e.currentTarget.value)}>{#each POSITIONS as id}<option value={id} disabled={id===leg.to||id===board[key][vertex-2]}>{id}</option>{/each}</select></label>
                <label>Receiver <select value={leg.to} onchange={e=>editThrow(leg,'to',e.currentTarget.value)}>{#each POSITIONS as id}<option value={id} disabled={id===leg.from||id===board[key][vertex+1]}>{id}</option>{/each}</select></label>
                <button onclick={()=>deleteThrow(leg)}>Delete throw</button>
              </div>
            {/if}
          </li>
                {/if}
              {/each}
            </ul>
          </section>
        {/each}
      </div>
      {/if}

    {/if}
  </section>

  {/if}
  <p role="status" class="board-message">{message}</p>
    </aside>
  </div>
  {#if presenting}
  <section class="presentation-controls" aria-label="Presentation controls">
    <p role="status" aria-live="polite" class="presentation-status">{teachingStatus}</p>
    <div class="presentation-actions"><button disabled={!frame?.time} onclick={()=>teach('previous')}>Previous Step</button><button class="presentation-play" onclick={()=>teach('toggle')}>{running?'Pause':'Play'}</button><button disabled={frame?.time>=presentationPlay.duration} onclick={()=>teach('next')}>Next Step</button><button onclick={()=>teach('restart')}>Replay</button></div>
    {@render teachingTools()}
    <div class="presentation-options"><label>Speed <select bind:value={speed} onchange={()=>playback.setSpeed(Number(speed))}><option value={0.5}>Slow · 0.5×</option><option value={1}>Normal · 1×</option><option value={2}>Fast · 2×</option></select></label></div>
  </section>
  {/if}
</main>
{#if libraryOpen}<PlayLibrary onclose={closeLibrary} onaction={libraryAction} onimport={importBoard} />{/if}
<style>
  .focus-picker{position:relative}.focus-picker summary{cursor:pointer;min-height:40px;padding:8px 12px;box-sizing:border-box;border:1px solid var(--border-emphasis);border-radius:var(--radius-control)}.focus-options{position:absolute;bottom:100%;left:0;z-index:10;background:var(--surface);border:1px solid var(--border-emphasis);border-radius:var(--radius-control);padding:12px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;min-width:240px}.focus-options button{grid-column:1/-1}.focus-options label{min-height:36px}
  .teaching-tools{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;padding:8px 0}.teaching-tools label{display:flex;align-items:center;gap:6px}
  .board-token.teaching-focus{outline:3px solid var(--accent-primary);outline-offset:4px;z-index:5}.board-token.teaching-secondary{opacity:0.65}
  .ghost-target{position:absolute;transform:translate(-50%,-50%);border:2px dashed var(--accent-primary);border-radius:50%;color:var(--baseball-line);background:rgba(7,23,34,.55);display:flex;align-items:center;justify-content:center;box-sizing:border-box;pointer-events:none;font-weight:700}

  .board-workspace{padding:16px;max-width:1800px;margin:auto}
  .board-header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}
  .board-brand{display:flex;align-items:center;gap:12px}
  .board-brand img{width:48px;height:48px;object-fit:contain}
  .board-header h1{margin:0;font-size:22px}.board-header p{margin:4px 0;color:var(--text-secondary)}
  .board-return{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:8px 14px;border:1px solid var(--border-emphasis);border-radius:var(--radius-control);background:var(--surface-raised);color:var(--text-primary);font-weight:700;text-decoration:none;white-space:nowrap;box-sizing:border-box}
  .board-return:hover{background:var(--surface-hover)}
  .board-layout{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:16px;align-items:start}
  .board-tools{grid-column:2;grid-row:1;position:sticky;top:16px;max-height:calc(100dvh - 32px);overflow:auto;padding:14px;display:grid;gap:14px;min-width:0}
  .board-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  .board-controls label{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  .board-save>label,.mode-controls>label:not(:has(input[type=checkbox])),.conversion label{width:100%;display:grid;gap:6px}
  .board-controls input:not([type=checkbox]),.board-controls select{width:100%;min-width:0;min-height:44px;box-sizing:border-box;padding:8px 10px;border:1px solid var(--border-emphasis);border-radius:var(--radius-control);background:var(--surface);color:var(--text-primary)}
  .board-controls button{min-height:44px}
  .save-actions>.save-board,.preview-main>button:first-child{background:var(--accent-primary);color:var(--text-on-accent)}
  .board-save{position:sticky;top:-14px;z-index:14;background:var(--surface);padding-block:8px}
  .save-status{font-size:12px;color:var(--text-muted);width:100%;margin:0}.save-actions{display:flex;gap:8px;width:100%;align-items:stretch}.save-actions>.save-board{flex:1;min-width:0}
  .board-more{position:relative}.board-more summary{list-style:none;cursor:pointer;min-height:44px;display:flex;align-items:center;padding:0 12px;border:1px solid var(--border);border-radius:var(--radius-control);font-weight:700}.board-more summary::-webkit-details-marker{display:none}.more-options{position:absolute;right:0;top:calc(100% + 6px);z-index:30;width:220px;max-width:calc(100vw - 48px);display:grid;gap:6px;padding:8px;background:var(--surface-raised);border:1px solid var(--border);border-radius:var(--radius-control);box-shadow:var(--shadow-raised)}.more-options button{text-align:left}
  .editing-toolbar{display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--border);padding-top:10px;font-weight:700}.edit-history{display:flex;gap:6px}.edit-history button{width:36px;min-height:36px;font-size:22px;padding:0}
  .preview-main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;width:100%}.preview-options{width:100%}.preview-options>summary{cursor:pointer;min-height:40px;align-content:center;color:var(--text-secondary)}.preview-options .teaching-tools{justify-content:flex-start}.preview-options .button-row{margin-top:8px}
  .board-controls p{margin:0;color:var(--text-secondary)}
  .playback-controls{border-top:1px solid var(--border);padding-top:12px}
  .playback-controls>label{width:100%}.playback-controls select{width:auto}
  .conversion{border-top:1px solid var(--border);padding-top:14px}
  .conversion .board-controls{margin-top:12px}
  .situation-mode{width:100%;min-height:44px}
  .conversion-heading{display:grid;gap:8px}.conversion-heading h2{margin:0;font-size:18px}.conversion-heading button{min-height:44px}
  .conversion p{color:var(--text-secondary)}.conversion label:has(input[type=checkbox]){display:flex}
  .throw-positions{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;width:100%}
  .throw-order{display:flex;flex-wrap:wrap;gap:6px;min-height:44px;align-items:center;padding:10px;background:var(--app-background);border-radius:var(--radius-control);width:100%;box-sizing:border-box}
  .button-row{display:flex;gap:8px;width:100%}.button-row button{flex:1}
  .field-workspace{grid-column:1;grid-row:1;position:sticky;top:8px;min-width:0;display:grid;gap:8px}
  .field-workspace .playback-controls{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-control);padding:6px 8px}
  .field-workspace .preview-main{width:auto;grid-template-columns:repeat(3,auto)}
  .field-workspace .playback-controls>label{width:auto}
  .field-workspace .preview-options{width:auto}
  .field-workspace .preview-options[open]{width:100%}
  .editing-toolbar{gap:8px}
  .editing-toolbar h2,.step-heading h2{font-size:16px;margin:0;overflow-wrap:anywhere}
  .editing-toolbar .edit-history{margin-left:auto}
  .step-options[open]{z-index:2}
  .step-options .more-options{width:180px}
  .step-heading{display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%}
  .step-heading h2{flex:1;min-width:0}
  .rename-step{flex:none}
  .step-rename-form{display:grid;gap:8px;width:100%;min-width:0}
  .step-rename-form label{display:grid}
  .starting-runners{display:flex;flex-wrap:wrap;gap:12px;border:0;margin:0;padding:0}
  .starting-runners legend{margin-bottom:4px}
  .add-step{border-style:dashed}
  .steps-sidebar{display:grid;gap:8px}
  .step-choices{display:grid;gap:6px;padding:8px;border:1px solid var(--border);border-radius:var(--radius-control);background:var(--surface-raised)}
  .step-choices button{text-align:left}
  .steps-sidebar ol{display:grid;gap:4px;margin:0;padding-left:26px}
  .steps-sidebar li button{width:100%;text-align:left}
  .steps-sidebar button{min-height:40px}
  .steps-sidebar button[aria-current=step]{border-color:var(--selection-border);background:var(--selection-background);color:var(--selection-text)}
  .runner-suggestions{width:100%}
  .field-instruction{margin:0;padding:8px 12px;background:var(--surface);border-radius:var(--radius-control);color:var(--text-secondary)}
  .step-section-label{font-size:13px;margin:8px 0 0;width:100%;color:var(--text-secondary)}
  .step-actions>li{width:100%;min-width:0}
  .step-actions>li>button{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left}
  .step-actions small{display:block;color:var(--text-secondary);margin-top:3px}
  .action-edit{color:var(--accent-text)}
  .action-groups,.action-group{width:100%;min-width:0}
  .action-groups{display:grid;gap:12px}
  .action-group{border-inline-start:2px solid var(--border);padding-inline-start:10px;box-sizing:border-box}
  .action-group h4{font-size:13px;color:var(--text-secondary);margin:0 0 6px}
  .board-movement-path.route-selected{stroke:var(--accent-primary);stroke-width:12;opacity:1}
  .step-actions button{min-height:36px;padding:6px 9px}
  .action-open{width:100%}
  .inline-fields{padding:8px;border:1px solid var(--border);border-radius:var(--radius-control);margin-top:6px}
  .inline-fields>label:not(:has(input[type=checkbox])){width:100%;display:grid}
  .step-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0;padding:0;list-style:none;width:100%}
  .ball-edit-target{position:absolute;transform:translate(-50%,-50%);z-index:5;border-radius:50%;min-width:0;min-height:0;padding:0;cursor:pointer}
  .ball-edit-target:is(:hover,:active,:focus){transform:translate(-50%,-50%)}
  .ball-edit-target,.ball-edit-target:is(:hover,:active,:focus){background:transparent;border:0;box-shadow:none;outline:none}
  .ball-edit-target:focus-visible + .board-ball{outline:2px solid var(--text-primary);outline-offset:2px}
  .board-field{position:relative;width:100%;aspect-ratio:3200/2133;overflow:hidden;border-radius:12px;border:1px solid var(--border)}
  .board-field img{width:100%;height:100%;display:block}
  .field-surface{position:absolute;inset:0;width:100%;height:100%;background:transparent;border:0;border-radius:0}
  .board-token{position:absolute;transform:translate(-50%,-50%);padding:0;min-width:0;min-height:0;border-radius:50%;touch-action:none;z-index:6}
  .board-token.movement-ready{cursor:grab;outline:2px solid var(--accent-primary)}
  .board-token:hover:not(:disabled),.board-token:active:not(:disabled){transform:translate(-50%,-50%)}
  .board-field .board-token{pointer-events:auto}.board-runner{z-index:9}.chosen{outline:2px solid white}
  .fielding-label{position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:11;padding:5px 10px;border-radius:var(--radius-control);background:var(--surface-raised);color:var(--text-primary);pointer-events:none}
  .board-ball{background:var(--field-ball);border-color:var(--field-ball);position:absolute;transform:translate(-50%,-50%);pointer-events:none;cursor:default;z-index:10}
  .board-throws .seq-route-underlay{stroke:var(--field-route-edge);stroke-width:15;fill:none;stroke-linecap:round}
  .board-throws .seq-route-active{stroke:var(--field-route);stroke-width:7.5;fill:none;stroke-linecap:round}
  .board-throws .seq-route-head{fill:var(--field-route);stroke:var(--field-route-edge);stroke-width:3.75;stroke-linejoin:round}
  .board-throws{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2}
  .board-message{white-space:pre-line;margin:0;min-height:24px}
  .board-tools[hidden],.board-workspace[hidden]{display:none}
  .presentation-navigation{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
  .presentation{position:fixed;inset:0;z-index:1000;max-width:none;width:100%;height:100dvh;box-sizing:border-box;background:var(--app-background);display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:8px;padding:12px;overflow:hidden}
  .presentation .board-header{margin:0;border:0}.presentation .board-brand,.presentation .board-brand>div{min-width:0}.presentation .board-header h1{overflow-wrap:anywhere}.presentation .board-header h1{font-size:clamp(18px,2vw,28px)}.presentation .board-header p{font-size:12px}
  .presentation .board-layout{display:flex;align-items:center;justify-content:center;min-height:0;overflow:hidden}
  .presentation .field-workspace{position:static;display:contents}
  .presentation .board-field{position:relative;top:auto;max-width:100%;max-height:100%;flex:none}
  .presentation .board-token{cursor:default}.presentation .field-surface{cursor:default}
  .presentation-controls{display:grid;gap:8px;max-width:1100px;width:100%;margin:auto}
  .presentation-status{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
  .presentation-actions{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
  .presentation-actions button,.presentation .board-return{min-height:56px;font-size:18px;font-weight:700;white-space:normal}
  .presentation-play{background:var(--accent-primary);color:var(--text-on-accent)}
  .presentation-options{display:flex;justify-content:center;align-items:center;gap:24px;flex-wrap:wrap}
  .presentation-options label{display:flex;align-items:center;gap:8px}.presentation-options select{min-height:44px;padding:6px 12px;background:var(--surface);color:var(--text-primary);border:1px solid var(--border-emphasis);border-radius:var(--radius-control)}
  @media(max-width:620px){.presentation-actions button{font-size:14px;padding:6px}.presentation .board-brand img{display:none}.presentation .board-header{gap:8px}.presentation .board-return{font-size:14px}.presentation-options{gap:12px}.presentation{padding:8px}}
  @media(min-width:1100px){.board-layout{grid-template-columns:minmax(0,1fr) 380px}.board-field{max-width:calc((100dvh - 166px)*1.50023);justify-self:center}}
  @media(max-width:899px){.board-layout{grid-template-columns:minmax(0,1fr)}.board-tools,.field-workspace{grid-column:1;max-height:none}.field-workspace{grid-row:1;position:relative;top:auto}.board-tools{position:relative;top:auto;grid-row:2}.board-save{position:static}.playback-controls{position:static}.board-workspace{padding:8px}.board-header p{font-size:12px}.board-header h1{font-size:20px}.board-brand img{width:36px;height:36px}}
</style>
