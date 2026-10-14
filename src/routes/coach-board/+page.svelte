<script>
  import { onMount, onDestroy } from 'svelte';
  import {emptyHistory,recordHistory,stepHistory} from '$lib/plays/history.js';
  import {importBoardFile,exportBoardFile,boardFileName} from '$lib/plays/board-transfer.js';
  import PlayLibrary from '$lib/components/PlayLibrary.svelte';
  import { copyLibraryPlay } from '$lib/plays/library.js';
  let libraryOpen=$state(false), libraryReturnToMain=$state(false);
  function closeLibrary(){libraryOpen=false;if(!presenting&&(!hasEditor||libraryReturnToMain)){leaving=true;window.location.assign('/');return;}requestAnimationFrame(()=>document.getElementById(presenting?(presentationOrigin==='library'?'backToLibrary':'exitPresentation'):'browseLibrary')?.focus());}
  function browseLibrary(){playback?.pause();libraryReturnToMain=false;libraryOpen=true;}
  import brandLogo from '$lib/assets/diamond-defence-logo.png';
  import fieldImage from '$lib/assets/diamond-defense-soft-field.png';
  import { FIELDING_NUMBERS, tokenMetrics, createOffenseNumbers } from '$lib/plays/token-presentation.js';
  import { BASES_NATIVE, IMG_W, IMG_H } from '$lib/plays/field.js';
  import { newBoard, clone, POSITIONS, BALL_TYPES, cleanPath, fromSituation, toSituation, upgradeBoard } from '$lib/plays/board.js';
  import {RUN_RESULTS,hasCustomRunning,runningDestination,useAutomaticRunning} from '$lib/plays/running.js';
  import { MAX_SEGMENTS, segmentStart, reconcileSegments, eventOptions, conditionValue, parseCondition } from '$lib/plays/segments.js';
  import { situationDraft, situationPlayIssues, writeHandoff, readHandoff, clearHandoff } from '$lib/plays/authoring.js';
  import { presentationStatus } from '$lib/plays/presentation.js';
  import { compilePlay, frameAt, traveledPath, createPlayback, TEACHING_PLAYBACK_RATE, movementDuration } from '$lib/plays/animation.js';
  let {data} = $props();
  let hasEditor=$state(false);
  let board=$state(newBoard()), mode=$state('Setup'), selected=$state('P'), ballType=$state('ground_ball');
  let frame=$state(null), running=$state(false), message=$state(''), busy=$state(false);
  let boardId=$state(''), revision=$state(0);
  let field, tools, layout, playback,moreMenu;
  let drag=$state(null);
  let presenting=$state(false), presentationWidth=$state(800), presentationPlay=$state(null);
  let presentationOrigin=$state('board'), presentationReturn, previousOverflow='';
  let focusPlayers=$state([]), showTargets=$state(false), showMovementPaths=$state(false);
  const movementPaths=$derived.by(()=>{
    if(!presenting&&mode==='Movement'&&!savingSituation&&(!frame||drag)){
      const routes=Object.entries(board.movements).flatMap(([id,segments])=>segments.map((segment,index)=>({id,index,path:segment.path}))).filter(route=>!focusPlayers.length||focusPlayers.includes(route.id));
      if(drag){const index=routes.findIndex(route=>route.id===drag.id&&route.index===drag.index);const active={id:drag.id,index:drag.index,path:cleanPath(drag.path)};if(index>=0)routes[index]=active;else routes.push(active);}
      return routes.filter(route=>route.path.length>1);
    }
    if(!showMovementPaths||!frame?.time)return [];try{const play=presenting?presentationPlay:compilePlay(board,{coachBoard:true});return play.tracks.filter(track=>POSITIONS.includes(track.id)&&(!focusPlayers.length||focusPlayers.includes(track.id))).map(track=>({id:track.id,index:track.index,path:traveledPath(track,frame.time)})).filter(route=>route.path.length>1);}catch{return [];}});
  const finalTargets=$derived.by(()=>{if(!showTargets)return [];try{const play=presenting?presentationPlay:compilePlay(board,{coachBoard:true});const final=frameAt(play,play.duration);return POSITIONS.filter(id=>!focusPlayers.length||focusPlayers.includes(id)).map(id=>[id,final.positions[id]]);}catch{return [];}});
  const teachingStatus=$derived(presentationStatus(presentationPlay,frame));
  function enterPresentation(origin='board'){
    try{
      presentationPlay=compilePlay(board,{coachBoard:true});
      presentationReturn={mode,savingSituation};presentationOrigin=origin;
      stop();playback=createPlayback(presentationPlay,value=>frame=value,value=>running=value,{rate:TEACHING_PLAYBACK_RATE,reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches});
      playback.setSpeed(Number(speed));playback.restart();presenting=true;
      previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
      requestAnimationFrame(()=>document.getElementById(origin==='library'?'backToLibrary':'exitPresentation')?.focus());
      return true;
    }catch(e){message=e.message;return false;}
  }
  function exitPresentation(destination='editor'){
    stop();presenting=false;document.body.style.overflow=previousOverflow;
    mode=presentationReturn?.mode||'Setup';savingSituation=presentationReturn?.savingSituation||false;
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
    stop();const value=JSON.parse(snapshot);board=value.board;result=value.result;batterResult=value.batterResult;
    outsRecorded=value.outsRecorded;runnerResults=value.runnerResults;taggedUp=value.taggedUp;confirmed=value.confirmed;rationale=value.rationale;
    ballType=board.battedBall?.type||'ground_ball';
    if(!board.defenders[selected]&&!board.runners[selected])selected='P';
    movementIndex=Math.max(0,Math.min(movementIndex,(board.movements[selected]?.length||1)-1));
    if(mode==='Playback')mode='Movement';
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
  function restoreSituation(situation){linkedSituation=clone(situation);situationBaseline=clone(situation);pendingSituation=false;rationale='';hydrate(fromSituation(situation));boardId='';revision=0;cleanSnapshot=editorSnapshot();message='Situation loaded for editing. Changes save to the same Situation.';}
  function draftSituation(){return {...situationDraft(board,linkedSituation),...outcomeMetadata()};}

  function backToField(event){if(dirty&&!window.confirm('Leave without saving these edits?')){event.preventDefault();return;}leaving=true;}

  let metrics=$state(tokenMetrics(800,800*IMG_H/IMG_W));
  let throwSequence=$state('playSeq'), speed=$state(1), movementIndex=$state(0);
  let confirmed=$state(false), result=$state('single'), batterResult=$state('first'), outsRecorded=$state(0), runnerResults=$state({}), taggedUp=$state({});
  const positions=$derived.by(()=>{
    if(frame)return frame.positions;
    const starts={...board.defenders,...board.runners};
    if(mode==='Movement'&&!savingSituation&&(!frame||drag)){
      for(const [id,segments] of Object.entries(board.movements)){const endpoint=segments.at(-1)?.path.at(-1);if(endpoint)starts[id]=endpoint;}
      starts[selected]=board.movements[selected]?.[movementIndex]?.path.at(-1)||segmentStart(board,selected,movementIndex);
    }
    return starts;
  });
  const selectedSegments=$derived(board.movements[selected]||[]);
  const movementOptions=$derived(eventOptions(board,movementIndex));
  const movementEvent=$derived(conditionValue(selectedSegments[movementIndex]||{},movementIndex));
  const ball=$derived(frame?.ball || board.battedBall?.destination);
  // Render the shared frame directly across delivery, contact, hit and throws.
  // A contact offset would jump forward and freeze until the flight caught up.
  const visibleBall=$derived((presenting||frame) ? (frame?.time>0?frame.ball:null) : ball);
  async function request(url,options) {
    const response=await fetch(url,options);const value=await response.json();
    if(!response.ok) throw new Error(value.error || value.message || 'Request failed.');return value;
  }
  function stop(){playback?.dispose();playback=null;running=false;frame=null;}
  function edit(){stop();confirmed=false;}
  function showSituationForm(show){playback?.pause();savingSituation=show;if(tools)tools.scrollTop=0;}
  function setMode(next){stop();mode=next;movementIndex=0;}
  function hydrate(value){stop();focusPlayers=[];showTargets=false;showMovementPaths=false;savingSituation=false;mode='Setup';selected='P';board=upgradeBoard(value);board.runners.batter ||= clone(BASES_NATIVE.home);movementIndex=0;board.offenseNumbers ||= createOffenseNumbers();throwSequence='playSeq';ballType=board.battedBall?.type||'ground_ball';confirmed=false;runnerResults={};taggedUp={};result=board.running?.result==='out'?'groundout':board.running?.result||'single';batterResult=runningDestination(board,'batter');for(const id of ['first','second','third'].filter(id=>board.runners[id]))runnerResults[id]=runningDestination(board,id);outsRecorded=0;const outcome=board.situationMetadata?.playOutcome||board.sourceSituation?.playOutcome;if(outcome){confirmed=outcome.reviewStatus==='ready';result=outcome.result;batterResult=outcome.batterResult;outsRecorded=outcome.outsRecorded;}for(const r of board.situationMetadata?.runnerOutcomes||board.sourceSituation?.runnerOutcomes||[]){runnerResults[r.startingBase]=r.result;taggedUp[r.startingBase]=r.taggedUp;}history=emptyHistory();historyText=false;}
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
      hydrate(fromSituation(transfer.situation));pendingSituation=!transfer.situation.revision||JSON.stringify(transfer.situation)!==JSON.stringify(situationBaseline);
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
    if(savingSituation||presenting)return;
    if(mode==='Throws'&&POSITIONS.includes(id)){event.preventDefault();appendThrow(id);return;}
    if(mode!=='Setup'&&mode!=='Movement')return;
    const before=editorSnapshot();history=recordHistory(history,before);event.preventDefault();edit();
    if(selected!==id){selected=id;movementIndex=0;}
    const start=clone(mode==='Movement'?segmentStart(board,id,movementIndex):board.defenders[id]||board.runners[id]);
    drag={before,id,index:movementIndex,pointer:event.pointerId,start,path:[start]};event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event){if(!drag||event.pointerId!==drag.pointer)return;const p=point(event);
    if(mode==='Setup'){if(board.defenders[drag.id])board.defenders[drag.id]=p;else board.runners[drag.id]=p;}
    else {const last=drag.path.at(-1);if(Math.hypot(p.x-last.x,p.y-last.y)>=8&&drag.path.length<4000)drag.path.push(p);frame={positions:{...positions,[drag.id]:p},ball:board.battedBall?.destination,arrows:[],scale:1};}
  }
  function up(event){if(!drag||event.pointerId!==drag.pointer)return;
    if(mode==='Movement'){
      drag.path.push(point(event));
      const segments=board.movements[drag.id]||[];
      segments[drag.index]={...(segments[drag.index]||{}),path:cleanPath(drag.path),start:segments[drag.index]?.start||{event:drag.index?'previous_movement':'contact'}};
      board.movements[drag.id]=segments;reconcileSegments(board,drag.id);
      if(drag.index<segments.length-1)message='Later movements reconnected to the new endpoint; preview them before saving.';
    }
    else if(board.movements[drag.id]){delete board.movements[drag.id];message='Starting position changed; record movement again.';}
    drag=null;frame=null;
  }
  function cancel(){if(drag)restoreSnapshot(drag.before);drag=null;frame=null;}
  function destination(event){if(presenting||savingSituation||mode!=='Ball')return;edit();board.battedBall={...(board.battedBall||{}),type:ballType,start:clone(BASES_NATIVE.home),destination:point(event)};}
  function runner(base,enabled){edit();if(enabled)board.runners[base]=clone(BASES_NATIVE[base==='batter'?'home':base]);else{delete board.runners[base];delete board.movements[base];}runnerResults[base]=runningDestination(board,base);}
  function appendThrow(id){
    if(board[throwSequence].at(-1)===id){message='Choose a different receiving fielder.';return;}
    if(board[throwSequence].length>=30){message='A sequence can contain up to 30 positions.';return;}
    edit();selected=id;board[throwSequence]=[...board[throwSequence],id];
  }
  function undoThrow(){edit();board[throwSequence]=board[throwSequence].slice(0,-1);}
  function clearThrows(){edit();board[throwSequence]=[];}
  function changeRunningResult(value){
    edit();board.running={result:value,destinations:{}};
    result=value==='out'?'groundout':value;batterResult=runningDestination(board,'batter');
    for(const id of ['first','second','third'].filter(id=>board.runners[id]))runnerResults[id]=runningDestination(board,id);
  }
  function changeRunningDestination(id,value){
    edit();board.running ||= {result:'single',destinations:{}};board.running.destinations[id]=value;
    if(id==='batter')batterResult=value;else runnerResults[id]=value;
  }
  function addMovement(){edit();movementIndex=selectedSegments.length;message='Drag the selected token from the previous endpoint to record its next movement.';}
  function deleteMovement(){edit();const segments=board.movements[selected]||[];segments.splice(movementIndex,1);
    if(segments.length){board.movements[selected]=segments;reconcileSegments(board,selected);if(segments[0].start?.event==='previous_movement')segments[0].start={event:'contact'};}
    else delete board.movements[selected];movementIndex=Math.max(0,Math.min(movementIndex,segments.length-1));message='Movement deleted. Remaining routes reconnected; preview before saving.';
  }
  function changeTiming(value){edit();const segment=selectedSegments[movementIndex];if(value==='automatic')delete segment.durationMs;else segment.durationMs=Math.max(250,movementDuration(segment));}
  function changeDuration(event){
    if(!event.currentTarget.reportValidity())return;
    const duration=Math.round(Number(event.currentTarget.value)*1000*TEACHING_PLAYBACK_RATE);
    if(duration<250||duration>30000)return;edit();selectedSegments[movementIndex].durationMs=duration;
  }
  const fieldingSummary=$derived.by(()=>{try{return compilePlay(board,{coachBoard:true});}catch{return null;}});
  function changeEvent(value){edit();selectedSegments[movementIndex].start=parseCondition(value);}
  function controls(){if(!playback){const play=compilePlay(board,{coachBoard:true});playback=createPlayback(play,value=>frame=value,value=>running=value,{rate:TEACHING_PLAYBACK_RATE,reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches});frame=frameAt(play,0);playback.setSpeed(Number(speed));}return playback;}
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
  function openSituationAfterSubmission(){const restored=situationBaseline||linkedSituation;hydrate(fromSituation(restored));linkedSituation=clone(restored);pendingSituation=false;rationale='';cleanSnapshot=editorSnapshot();}
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
      else{linkedSituation=clone(copy);situationBaseline=null;rationale='';hydrate(fromSituation(copy));boardId='';revision=0;pendingSituation=true;cleanSnapshot=editorSnapshot();}
      message='Independent copy opened. Save or publish this draft when ready.';
      return true;
    }
    if(item.type==='board')restoreBoard(record);
    else restoreSituation(record);
    if(action==='present'&&!enterPresentation('library'))throw new Error(message);
    return true;
  }

  async function deleteBoard(){
    if(!window.confirm(`Delete Board “${board.title}”? This cannot be undone. The open draft will remain available.`))return;
    busy=true;try{await request(`/api/play-library/board/${encodeURIComponent(boardId)}`,{method:'DELETE',headers:{'If-Match':String(revision)}});boardId='';revision=0;pendingSituation=true;message='Saved Board deleted. Save this draft to create a new Board.';}catch(e){message=e.message;}finally{busy=false;}
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
      <div class="editing-toolbar"><span>{savingSituation?'Outcomes':'Edit play'}</span><div class="edit-history" role="group" aria-label="Edit history"><button aria-label="Undo" title="Undo (Cmd/Ctrl+Z)" disabled={busy||!!drag||history.index<=0&&(!historyText||history.entries[history.index]===editorSnapshot())} onclick={()=>undoEdit(-1)}>↶</button><button aria-label="Redo" title="Redo (Cmd/Ctrl+Shift+Z)" disabled={busy||!!drag||history.index>=history.entries.length-1||historyText&&history.entries[history.index]!==editorSnapshot()} onclick={()=>undoEdit(1)}>↷</button></div></div>
  {#if savingSituation}
  <section class="conversion" id="situation-conversion" aria-label="Save Situation options"><div class="conversion-heading"><h2>{linkedSituation?'Save Situation Changes':'Save as Situation'}</h2><button onclick={()=>showSituationForm(false)}>Back to Board Tools</button></div><p>Final defender positions become correctness targets. Movement curves remain instructional metadata.</p>
    <div class="board-controls"><label>Play result <select bind:value={result} onchange={()=>confirmed=false}>{#each ['single','double','triple','home_run','ground_rule_double','groundout','caught_fly','caught_line','sacrifice_bunt','squeeze_bunt','sacrifice_fly','fielders_choice','double_play','error','other'] as value}<option value={value}>{value.replaceAll('_',' ')}</option>{/each}</select></label>
    <label>Batter result <select bind:value={batterResult} onchange={()=>confirmed=false}>{#each ['out','first','second','third','home'] as value}<option value={value}>{value}</option>{/each}</select></label>
    <label>Outs recorded <select bind:value={outsRecorded} onchange={()=>confirmed=false}>{#each [0,1,2,3] as value}<option value={value}>{value}</option>{/each}</select></label>
    {#each ['first','second','third'].filter(base=>board.runners[base]) as base}<label>Runner on {base}<select bind:value={runnerResults[base]} onchange={()=>confirmed=false}>{#each ['hold','second','third','home','out'] as value}<option value={value}>{value}</option>{/each}</select></label><label><input type="checkbox" bind:checked={taggedUp[base]} onchange={()=>confirmed=false} /> Runner on {base} tagged up</label>{/each}
    <label><input type="checkbox" bind:checked={confirmed} /> I confirm these play and runner outcomes</label>{#if linkedSituation&&!data.canPublish}<label>Proposal reason <textarea bind:value={rationale}></textarea></label>{/if}<button disabled={busy} onclick={publish}>{linkedSituation?(data.canPublish?'Publish Situation':'Submit for Review'):'Create Situation'}</button></div>
  </section>
  {:else}
  <nav class="board-controls" aria-label="Authoring modes">{#each ['Setup','Movement','Running','Ball','Throws'] as item}<button aria-pressed={mode===item} onclick={()=>setMode(item)}>{item}</button>{/each}</nav>
  <section class="board-controls mode-controls" aria-label="Mode controls">
    {#if mode==='Setup'}
      <p>Drag tokens to set starting positions.</p><label>Outs <select bind:value={board.outs} onchange={edit}>{#each [0,1,2] as n}<option value={n}>{n}</option>{/each}</select></label>
      <p>The batter is always included. Add runners on base below.</p>
      {#each ['first','second','third'] as base}<label><input type="checkbox" checked={!!board.runners[base]} onchange={e=>runner(base,e.currentTarget.checked)} /> {base}</label>{/each}
    {:else if mode==='Movement'}
      <p>Drag a token along its route. Dotted paths appear as you draw and remain here for review.</p>
      <label>Token <select bind:value={selected} onchange={()=>{stop();movementIndex=0;}}>{#each [...POSITIONS,...Object.keys(board.runners)] as id}<option value={id}>{id}{board.movements[id]?` · ${board.movements[id].length} movements`:''}</option>{/each}</select></label>
      <label>Movement <select bind:value={movementIndex} onchange={stop}>{#each selectedSegments as segment,i}<option value={i}>Movement {i+1}</option>{/each}{#if !selectedSegments.length||movementIndex===selectedSegments.length}<option value={selectedSegments.length}>Record Movement {selectedSegments.length+1}</option>{/if}</select></label>
      <div class="button-row"><button disabled={!selectedSegments.length||selectedSegments.length>=MAX_SEGMENTS||movementIndex===selectedSegments.length} onclick={addMovement}>Add Movement</button><button disabled={!selectedSegments[movementIndex]} onclick={deleteMovement}>Delete Movement</button></div>
      {#if selectedSegments[movementIndex]}<label>Start movement <select value={movementEvent} onchange={e=>changeEvent(e.currentTarget.value)}>{#each movementOptions as option}<option value={option.value}>{option.label}</option>{/each}</select></label>
        <label>Movement timing <select value={selectedSegments[movementIndex].durationMs===undefined?'automatic':'custom'} onchange={e=>changeTiming(e.currentTarget.value)}><option value="automatic">Automatic</option><option value="custom">Custom duration</option></select></label>
        {#if selectedSegments[movementIndex].durationMs!==undefined}<label>Duration at Normal speed (seconds) <input type="number" min="1" max="120" step="0.1" value={selectedSegments[movementIndex].durationMs/(1000*TEACHING_PLAYBACK_RATE)} onchange={changeDuration} /></label>
        {:else}<p>Automatic duration: {(movementDuration(selectedSegments[movementIndex])/(1000*TEACHING_PLAYBACK_RATE)).toFixed(1)} seconds at Normal speed.</p>{/if}
      {/if}
      <button disabled={!selectedSegments.length} onclick={()=>{edit();delete board.movements[selected];movementIndex=0;}}>Clear Movement</button><span>Drag again to re-record the selected movement. Later routes reconnect to its endpoint.</span>
    {:else if mode==='Running'}
      <p>Automatic running starts at contact. Custom post-contact routes take precedence. Suggested advances can be changed below.</p>
      <label>Hit result <select value={board.running?.result||'single'} onchange={e=>changeRunningResult(e.currentTarget.value)}>{#each RUN_RESULTS as value}<option value={value}>{value.replaceAll('_',' ')}</option>{/each}</select></label>
      {#each ['batter','first','second','third'].filter(id=>board.runners[id]) as id}
        <label>{id==='batter'?'Batter destination':`Runner on ${id} destination`} <select disabled={hasCustomRunning(board,id)} value={runningDestination(board,id)} onchange={e=>changeRunningDestination(id,e.currentTarget.value)}>{#each (id==='batter'?['first','second','third','home','out']:id==='first'?['hold','second','third','home','out']:id==='second'?['hold','third','home','out']:['hold','home','out']) as destination}<option value={destination}>{destination}</option>{/each}</select></label>
        {#if hasCustomRunning(board,id)}<p>{id}: Custom route</p><button onclick={()=>{edit();useAutomaticRunning(board,id);}}>Use automatic running for {id}</button>{/if}
      {/each}
      <p>Out shows an attempted advance; it does not determine a putout. Save as Situation outcomes still require your review.</p>
    {:else if mode==='Ball'}
      <label>Batted-ball type <select bind:value={ballType} onchange={()=>{edit();if(board.battedBall)board.battedBall.type=ballType;}}>{#each BALL_TYPES as type}<option value={type}>{type.replaceAll('_',' ')}</option>{/each}</select></label><p>Tap the field to set the destination.</p>
      {#if board.battedBall}<label>Ball fielder <select value={board.battedBall.fielder||''} onchange={e=>{edit();if(e.currentTarget.value)board.battedBall.fielder=e.currentTarget.value;else delete board.battedBall.fielder;}}><option value="">Automatic (first throw or nearest route)</option>{#each POSITIONS as id}<option value={id}>{id}</option>{/each}</select></label>
      {#if fieldingSummary?.fielder}<p>{fieldingSummary.fielder} fields the ball after {(fieldingSummary.ballDuration/(1000*TEACHING_PLAYBACK_RATE)).toFixed(1)} seconds from contact at Normal speed.</p>{/if}
      {#if fieldingSummary?.fieldingWarning}<p role="note">{fieldingSummary.fieldingWarning}</p>{/if}{/if}
    {:else if mode==='Throws'}
      <label>Sequence to edit <select bind:value={throwSequence}><option value="playSeq">Primary throws</option><option value="playSeq2">Secondary throws</option></select></label>
      <p>Tap defenders on the field or choose positions below in throw order. Positions can repeat, for example C → 2B → C.</p>
      <div class="throw-positions" role="group" aria-label="Choose throw positions">{#each POSITIONS as id}<button disabled={board[throwSequence].at(-1)===id || board[throwSequence].length>=30} onclick={()=>appendThrow(id)}>{id}</button>{/each}</div>
      <div class="throw-order" role="group" aria-label="Throw sequence">{#if board[throwSequence].length}{#each board[throwSequence] as id,i}<span>{#if i>0}<span aria-hidden="true">→ </span>{/if}{i+1}. {id}</span>{/each}{:else}<span>No throws yet. Choose the first fielder.</span>{/if}</div>
      <div class="button-row"><button disabled={!board[throwSequence].length} onclick={undoThrow}>Undo Last Throw</button><button disabled={!board[throwSequence].length} onclick={clearThrows}>Clear Throws</button></div>
      <p>Arrows represent defensive throws.</p>
    {:else}<p>Play includes optional pre-pitch movement, the pitch, contact, and throws.</p>{/if}
  </section>
  <section class="board-controls playback-controls" aria-label="Playback controls">
    <div class="preview-main"><button onclick={()=>running?playback.pause():playbackAction('play')}>{running?'Pause':'Play'}</button><button onclick={()=>playbackAction('restart')}>Replay</button><button id="presentBoard" onclick={()=>enterPresentation()}>Present</button></div>
    <label>Speed <select bind:value={speed} onchange={()=>playback?.setSpeed(Number(speed))}>{#each [0.5,1,2] as value}<option value={value}>{value}×</option>{/each}</select></label>
    <details class="preview-options"><summary>Preview options</summary><div class="button-row"><button onclick={()=>{try{controls().step(-1);}catch(e){message=e.message;}}}>Previous Step</button><button onclick={()=>{try{controls().step(1);}catch(e){message=e.message;}}}>Next Step</button></div>{@render teachingTools()}</details>
  </section>
  {/if}
  <p role="status" class="board-message">{message}</p>
    </aside>
  <div class="board-field" style:width={presenting?`${presentationWidth}px`:undefined} bind:this={field} role="group" aria-label="Baseball play field">
    <img src={fieldImage} alt="Baseball field" draggable="false" />
    <button class="field-surface" aria-label="Set batted-ball destination" tabindex={presenting?-1:0} aria-disabled={presenting} onclick={destination}></button>
    <svg class="board-throws" viewBox={`0 0 ${IMG_W} ${IMG_H}`} aria-hidden="true"><defs><marker id="boardThrowArrow" markerWidth="16" markerHeight="12" refX="15" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M1,1 L15,6 L1,11 L4,6 Z" fill="var(--accent-primary)" /></marker></defs>
      {#if showMovementPaths||(!presenting&&mode==='Movement'&&!savingSituation)}{#each movementPaths as route (`${route.id}-${route.index}`)}<path class="board-movement-path" data-position={route.id} d={route.path.map((p,i)=>`${i?'L':'M'} ${p.x},${p.y}`).join(' ')} fill="none" stroke="#f4f7fb" stroke-width="8" stroke-dasharray="1 20" stroke-linecap="round" style="filter:drop-shadow(0 1px 2px #071722)" opacity="0.85" />{/each}{/if}
      {#if board.battedBall && frame?.time>0 && frame.events?.some(event=>event.type==='contact') && !frame.events?.some(event=>event.type==='ball_fielded')}<path class="board-hit-path" d={`M ${board.battedBall.start.x},${board.battedBall.start.y} L ${board.battedBall.destination.x},${board.battedBall.destination.y}`} fill="none" stroke="var(--accent-primary)" stroke-width="8" stroke-dasharray={board.battedBall.type==='ground_ball'?'16 16':undefined} stroke-linecap="round" opacity="0.65" />{/if}
      {#each frame?.arrows || [] as arrow}<path class="seq-route-underlay" d={`M ${arrow.from.x} ${arrow.from.y} L ${arrow.from.x+(arrow.to.x-arrow.from.x)*arrow.progress} ${arrow.from.y+(arrow.to.y-arrow.from.y)*arrow.progress}`} stroke-width="14" /><path class="seq-route-active" d={`M ${arrow.from.x} ${arrow.from.y} L ${arrow.from.x+(arrow.to.x-arrow.from.x)*arrow.progress} ${arrow.from.y+(arrow.to.y-arrow.from.y)*arrow.progress}`} stroke-width="8" marker-end="url(#boardThrowArrow)" />{/each}
    </svg>
    {#each finalTargets as [id,p] (id)}<span class="ghost-target" style:left={`${p.x/IMG_W*100}%`} style:top={`${p.y/IMG_H*100}%`} style:width={`${metrics.defender}px`} style:height={`${metrics.defender}px`} style:font-size={`${metrics.defenderFont}px`} aria-label={`${id} final target`}>{id}</span>{/each}
    {#each Object.entries(positions) as [id,p] (id)}<button class:board-runner={!POSITIONS.includes(id)} class={`board-token ${POSITIONS.includes(id)?'chip '+(['P','C'].includes(id)?'Battery':['LF','CF','RF'].includes(id)?'Outfield':'Infield'):'baseRunner'}`} class:chosen={!presenting&&selected===id} class:teaching-focus={focusPlayers.includes(id)} class:teaching-secondary={!!focusPlayers.length&&POSITIONS.includes(id)&&!focusPlayers.includes(id)} data-fielding-number={FIELDING_NUMBERS[id]} style:width={`${POSITIONS.includes(id)?metrics.defender:metrics.runner}px`} style:height={`${POSITIONS.includes(id)?metrics.defender:metrics.runner}px`} style:font-size={`${metrics.defenderFont}px`} style:left={`${p.x/IMG_W*100}%`} style:top={`${p.y/IMG_H*100}%`} aria-label={`${id} token`} tabindex={presenting?-1:0} aria-disabled={presenting} onpointerdown={e=>down(e,id)} onpointermove={move} onpointerup={up} onpointercancel={cancel}>{#if POSITIONS.includes(id)}{id}{:else}<span class="rlabel" style:font-size={`${metrics.runnerFont}px`}>{board.offenseNumbers[id]}</span>{/if}</button>{/each}
    {#if visibleBall}<span class="ball board-ball" style:left={`${visibleBall.x/IMG_W*100}%`} style:top={`${visibleBall.y/IMG_H*100}%`} style:scale={frame?.scale||1} style:width={`${metrics.ball}px`} style:height={`${metrics.ball}px`} style:box-shadow={`0 0 0 ${metrics.ballOutline}px #000, 0 1px ${metrics.ballShadow}px rgba(0,0,0,.35)`} aria-label="Baseball"></span>{/if}
  </div>
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
  .ghost-target{position:absolute;transform:translate(-50%,-50%);border:2px dashed var(--accent-primary);border-radius:50%;color:var(--text-primary);background:rgba(7,23,34,.55);display:flex;align-items:center;justify-content:center;box-sizing:border-box;pointer-events:none;font-weight:700}

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
  .save-status{font-size:12px;color:var(--text-muted);width:100%;margin:0}.save-actions{display:flex;gap:8px;width:100%;align-items:stretch}.save-actions>.save-board{flex:1;min-width:0}
  .board-more{position:relative}.board-more summary{list-style:none;cursor:pointer;min-height:44px;display:flex;align-items:center;padding:0 12px;border:1px solid var(--border);border-radius:var(--radius-control);font-weight:700}.board-more summary::-webkit-details-marker{display:none}.more-options{position:absolute;right:0;top:calc(100% + 6px);z-index:30;width:220px;max-width:calc(100vw - 48px);display:grid;gap:6px;padding:8px;background:var(--surface-raised);border:1px solid var(--border);border-radius:var(--radius-control);box-shadow:var(--shadow-raised)}.more-options button{text-align:left}
  .editing-toolbar{display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--border);padding-top:10px;font-weight:700}.edit-history{display:flex;gap:6px}.edit-history button{width:36px;min-height:36px;font-size:22px;padding:0}
  .preview-main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;width:100%}.preview-options{width:100%}.preview-options>summary{cursor:pointer;min-height:40px;align-content:center;color:var(--text-secondary)}.preview-options .teaching-tools{justify-content:flex-start}.preview-options .button-row{margin-top:8px}
  .board-controls p{margin:0;color:var(--text-secondary)}
  nav.board-controls{display:flex;gap:6px;flex-wrap:wrap}
  nav button{padding:6px;font-size:13px;min-height:36px!important}button[aria-pressed=true]{outline:2px solid var(--accent-primary)}
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
  .board-field{grid-column:1;grid-row:1;position:sticky;top:16px;width:100%;aspect-ratio:3200/2133;overflow:hidden;border-radius:12px;border:1px solid var(--border)}
  .board-field img{width:100%;height:100%;display:block}
  .field-surface{position:absolute;inset:0;width:100%;height:100%;background:transparent;border:0;border-radius:0}
  .board-token{position:absolute;transform:translate(-50%,-50%);padding:0;min-width:0;min-height:0;border-radius:50%;touch-action:none;z-index:6}
  .board-token:hover:not(:disabled),.board-token:active:not(:disabled){transform:translate(-50%,-50%)}
  .board-field .board-token{pointer-events:auto}.board-runner{z-index:9}.chosen{outline:2px solid white}
  .board-ball{position:absolute;transform:translate(-50%,-50%);pointer-events:none;cursor:default;z-index:10}
  .board-throws{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2}
  .board-message{white-space:pre-line;margin:0;min-height:24px}
  .board-tools[hidden],.board-workspace[hidden]{display:none}
  .presentation-navigation{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
  .presentation{position:fixed;inset:0;z-index:1000;max-width:none;width:100%;height:100dvh;box-sizing:border-box;background:var(--app-background);display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:8px;padding:12px;overflow:hidden}
  .presentation .board-header{margin:0;border:0}.presentation .board-brand,.presentation .board-brand>div{min-width:0}.presentation .board-header h1{overflow-wrap:anywhere}.presentation .board-header h1{font-size:clamp(18px,2vw,28px)}.presentation .board-header p{font-size:12px}
  .presentation .board-layout{display:flex;align-items:center;justify-content:center;min-height:0;overflow:hidden}
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
  @media(min-width:1100px){.board-layout{grid-template-columns:minmax(0,1fr) 380px}.board-field{max-width:calc((100dvh - 110px)*1.50023);justify-self:center}}
  @media(max-width:899px){.board-layout{grid-template-columns:minmax(0,1fr)}.board-tools,.board-field{grid-column:1;position:relative;top:auto;max-height:none}.board-tools{grid-row:1}.board-field{grid-row:2}.playback-controls{position:static}.board-workspace{padding:8px}.board-header p{font-size:12px}.board-header h1{font-size:20px}.board-brand img{width:36px;height:36px}}
</style>
