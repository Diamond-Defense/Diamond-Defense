import {inferBallLocation, shortSituationTitle, qualifiedSituationLabel} from '../domain/situation-identity';
import {TEACHING_CATEGORIES} from '../domain/situation-metadata';
import {libraryBallDetails,occupancyLabel} from './library.js';

// Pure shared presentation model. Callers supply only records already visible
// to the current user; rendering never fetches or broadens that catalog.
export function libraryCardModel(record,type='situation',extra={}){
 const hit=type==='board'?record.battedBall?.destination:record.hit;
 const location=hit&&Number.isFinite(hit.x)&&Number.isFinite(hit.y)?inferBallLocation(hit):'';
 const details=libraryBallDetails(record,type,location);
 const savedTitle=extra.title||record.title||'Untitled';
 const embeddedVariation=savedTitle.match(/\s+[—–]\s+(variation\s*(?:[a-z]+|\d+))\s*$/i)?.[1]||'';
 const withoutVariation=type==='situation'?savedTitle.replace(/\s+[—–]\s+variation\s*(?:[a-z]+|\d+)\s*$/i,''):savedTitle;
 const occupied=['first','second','third'].filter((base,i)=>extra.runners!==undefined?!!(extra.runners&(1<<i)):!!record.runnersOn?.[base]);
 const runnerSuffix=' — '+(occupied.length===3?'Bases Loaded':!occupied.length?'Bases Empty':`${occupied.length===1?'Runner':'Runners'} on ${occupied.map(base=>base[0].toUpperCase()+base.slice(1)).join(' and ')}`);
 const legacyCardTitle=type==='situation'&&withoutVariation.endsWith(runnerSuffix)&&withoutVariation.length>runnerSuffix.length?withoutVariation.slice(0,-runnerSuffix.length):withoutVariation;
 const cardTitle=type==='situation'?shortSituationTitle({...record,title:savedTitle}):legacyCardTitle;
 let variation='';
 if(record.variationTagged&&Number.isSafeInteger(record.variationNumber)&&record.variationNumber>0){let number=record.variationNumber,letters='';while(number>0){number--;letters=String.fromCharCode(65+number%26)+letters;number=Math.floor(number/26);}variation=`Variation ${letters}`;}
 const variationLabel=extra.variationLabel||[variation,details.variationLabel].filter(Boolean).filter((value,index,values)=>values.indexOf(value)===index).join(' · ')||embeddedVariation;
 const metadata=type==='board'?record.situationMetadata||{}:record;
 const difficulty=metadata.difficulty==='beginner'?'foundational':metadata.difficulty;
 const result=metadata.playOutcome?.result||record.running?.result;
 const hitOutcome=['Singles','Extra-base hits','General'].includes(metadata.category)?metadata.category:result==='single'?'Singles':['double','triple','home_run','ground_rule_double'].includes(result)?'Extra-base hits':'General';
 const ballType=(type==='board'?record.battedBall?.type:record.boardAnimation?.battedBall?.type)||({line:'line_drive',grounder:'ground_ball',popup:'pop_fly'}[record.hitType]);
 return {...extra,type,id:extra.id||record.key||record.id||'',title:savedTitle,cardTitle,
  concept:extra.concept||metadata.primaryCategory||'',related:type==='board'?JSON.stringify(metadata.relatedCategories||[]):extra.related||JSON.stringify(metadata.relatedCategories||[]),hitOutcome,
  createdAt:extra.createdAt||record.createdAt||'',updatedAt:extra.updatedAt||record.updatedAt||'',
  displayCode:extra.displayCode||record.displayCode||'',description:extra.description??record.desc??'',location,...details,
  variationLabel,
  runners:extra.runners??['first','second','third'].reduce((mask,base,i)=>mask|((type==='board'?record.runners?.[base]:record.runnersOn?.[base])?1<<i:0),0),
  outs:Number(record.outs||0),difficulty,
  difficultyLabel:({foundational:'Foundational',intermediate:'Intermediate',advanced:'Advanced'})[difficulty]||'',
  categoryLabel:TEACHING_CATEGORIES.find(category=>category.id===metadata.primaryCategory)?.label||'',
  ballType:['fly_ball','pop_fly'].includes(ballType)?'air_ball':ballType||'',
 };
}
function span(className,text){const el=document.createElement('span');el.className=className;if(text)el.textContent=text;return el;}
function icon(kind){
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
 const circle=(x,y,r)=>{const node=document.createElementNS(ns,'circle');for(const [key,value]of Object.entries({cx:x,cy:y,r}))node.setAttribute(key,String(value));svg.append(node);};
 if(kind==='placement'){const path=document.createElementNS(ns,'path');path.setAttribute('d','M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z');svg.append(path);circle(12,10,3);}else{circle(12,12,9);circle(12,12,1);}
 return svg;
}
const cardObservers=new WeakMap();
export function disconnectLibraryCard(host){cardObservers.get(host)?.disconnect();cardObservers.delete(host);}
export {shortSituationTitle, qualifiedSituationLabel};
export function renderLibraryCardContent(host,item,options={}){
 host.classList.toggle('library-card-compact',host.clientWidth<=348);
 if(typeof ResizeObserver!=='undefined'&&!cardObservers.has(host)){const observer=new ResizeObserver(entries=>host.classList.toggle('library-card-compact',entries[0].contentRect.width<=320));observer.observe(host);cardObservers.set(host,observer);}
 host.setAttribute('aria-description',[item.displayCode,item.location,item.fieldingMethod,occupancyLabel(item.runners),`${item.outs} outs`,item.variationLabel].filter(Boolean).join('. '));
 const body=span('library-card-content');
 const meta=span('library-card-meta');meta.append(span('library-card-code',item.displayCode));
 const badges=span('library-card-badges');
 if(item.difficultyLabel){const tag=span('library-card-difficulty',item.difficultyLabel);tag.dataset.difficulty=item.difficulty;badges.append(tag);}
 if(!options.summary)badges.append(span('library-card-kind',item.type==='board'?'Board':'Situation'));meta.append(badges);
 if(item.current)meta.append(span('library-card-current','✓ Current'));
 const title=document.createElement('strong');title.className='library-card-title';title.textContent=item.cardTitle||item.title;title.title=item.cardTitle||item.title;
 const details=span('library-card-details');
 const placement=span('library-card-placement');placement.title=item.location||'Placement not set';placement.append(icon('placement'),document.createTextNode(item.placement||'Not set'));
 const method=span('library-card-fielding');method.title=item.fieldingReview?'Fielding method is missing or conflicts with the play result. Confirm in the Designer.':item.fieldingMethod;
 const full=span('library-fielding-full',item.fieldingMethod),short=span('library-fielding-short',item.fieldingMethod==='Fielded on the ground'?'Fielded':item.fieldingMethod);short.setAttribute('aria-hidden','true');method.append(icon('fielding'),full,short);details.append(placement,method);
 const context=item.variationLabel?span('library-card-context',item.variationLabel):null;
 if(context)context.title=item.variationLabel;
 const state=span('playbook-card-state library-card-state');
 for(const kind of ['Runners','Outs']){
  const group=span('playbook-state-group'),map=span(kind==='Runners'?'training-base-map':'training-out-map');map.setAttribute('aria-hidden','true');
  if(kind==='Runners')for(const [i,base]of ['first','second','third'].entries()){const marker=document.createElement('i');marker.dataset.marker=base;marker.classList.toggle('is-occupied',!!(item.runners&(1<<i)));map.append(marker);}
  else for(let i=0;i<2;i++){const marker=document.createElement('i');marker.classList.toggle('is-recorded',i<item.outs);map.append(marker);}
  group.append(span('playbook-state-label',kind),map,span('library-card-state-caption',kind==='Runners'?occupancyLabel(item.runners):`${item.outs} ${item.outs===1?'out':'outs'}`));state.append(group);
 }
 if(options.summary&&options.showCategory!==false&&item.categoryLabel)body.append(span('library-card-category',item.categoryLabel));
 body.append(meta);if(context)body.append(context);body.append(title,details,state);host.replaceChildren(body);
 const shell=host.parentElement;
 if(shell&&!options.summary){
  shell.classList.add('library-card-shell');shell.classList.toggle('is-current',!!item.current);

 }
}


const BASE_STATE_ORDER=[0,1,2,4,3,5,6,7];
const BASE_STATE_NAMES=['Bases empty','Runner on first','Runner on second','Runners on first and second','Runner on third','Runners on first and third','Runners on second and third','Bases loaded'];
export function libraryStartingState(item){
 const mask=typeof item.runners==='number'?item.runners:['first','second','third'].reduce((value,base,i)=>value|(item.runnersOn?.[base]?1<<i:0),0);
 const outs=Number(item.outs||0);
 return {key:`${mask}:${outs}`,rank:BASE_STATE_ORDER.indexOf(mask),outs,label:`${BASE_STATE_NAMES[mask]} · ${outs} ${outs===1?'out':'outs'}`};
}
export function compareLibraryOrder(a,b){
 const difficultyRank=item=>({foundational:0,beginner:0,intermediate:1,advanced:2})[item.difficulty]??3;
 const first=libraryStartingState(a),second=libraryStartingState(b);
 return difficultyRank(a)-difficultyRank(b)||first.rank-second.rank||first.outs-second.outs||String(a.title||'').localeCompare(String(b.title||''))||String(a.displayCode||a.key||a.id||'').localeCompare(String(b.displayCode||b.key||b.id||''),undefined,{numeric:true});
}

const playerSummaryState=new WeakMap();
export function renderPlayerSituationSummary(hud,record){
 if(!hud||!record)return;
 const model=libraryCardModel(record);
 const signature=JSON.stringify(model);
 if(playerSummaryState.get(hud)===signature&&hud.querySelector('.player-library-summary'))return;
 let summary=hud.querySelector('.player-library-summary');
 if(!summary){summary=document.createElement('div');summary.className='player-library-summary situation-summary';hud.append(summary);}
 const notes=hud.querySelector('#situationNotes');if(notes)notes.remove();
 renderLibraryCardContent(summary,model,{summary:true,showCategory:false});if(notes)summary.append(notes);
 hud.classList.add('has-library-summary');
 playerSummaryState.set(hud,signature);
}
