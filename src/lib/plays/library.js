// Copies are drafts. Save/publish assigns a fresh record and existing permission rules.
export function copyLibraryPlay(type,source,title,key){
 const copy=JSON.parse(JSON.stringify(source));
 copy.title=title.trim();
 if(!copy.title||copy.title.length>120)throw new Error('Enter a name of 1–120 characters.');
 if(type==='board')return copy;
 copy.key=key;
 for(const field of ['revision','displayCode','active','archivedAt','variationNumber','variationTagVersion','identityKey','createdAt','updatedAt','createdBy'])delete copy[field];
 return copy;
}
export function occupancyLabel(mask){return mask===0?'Bases empty':mask===7?'Bases loaded':['1st','2nd','3rd'].filter((_,i)=>mask&(1<<i)).join(' + ');}
export function ballLabel(type){return {ground_ball:'Ground ball',line_drive:'Line drive',air_ball:'Fly / pop fly'}[type]||'Ball not set';}

// Placement is geometric, shared with the Designer; fielding is never guessed from the title.
export function libraryBallDetails(record,type,location){
 const hit=type==='board'?record.battedBall:record.boardAnimation?.battedBall;
 const ballType=hit?.type||({grounder:'ground_ball',line:'line_drive',popup:'pop_fly'}[record.hitType]);
 const explicit=ballType==='ground_ball'?'ground':hit?.fielding;
 const result=type==='board'?(record.situationMetadata?.playOutcome?.result||record.running?.result):record.playOutcome?.result;
 const catchResult=['caught_fly','caught_line','sacrifice_fly'].includes(result);
 const hitResult=['single','double','triple','home_run','ground_rule_double'].includes(result);
 const conflict=explicit==='ground'&&catchResult||explicit==='caught'&&hitResult;
 const fieldingReview=!explicit||conflict;
 const placement=location.startsWith('Shallow ')?'Shallow':location.startsWith('Deep ')?'Deep':/^[LR]F Line$/.test(location)?'Down the line':['Left-Center','Right-Center'].includes(location)?'In the gap':['LF','CF','RF'].includes(location)?'Medium depth':location;
 return {placement,variationLabel:record.audience?.staffVariant||'',fieldingReview,fieldingMethod:fieldingReview?'Unconfirmed':explicit==='caught'?'Caught':'Fielded on the ground'};
}
