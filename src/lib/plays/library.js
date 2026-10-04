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
