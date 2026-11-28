import {compareLibraryOrder} from './library-card.js';
import {TEACHING_CATEGORIES} from '../domain/situation-metadata';
export const LIBRARY_PAGE_SIZE=20;
export function filterLibraryItems(items,filters){
 const {q='',type='',runners='',outs='',ball='',location='',concept='',difficulty='',outcome=''}=filters;
 return items.filter(item=>{
  const related=JSON.parse(item.related||'[]');
  const labels=TEACHING_CATEGORIES.filter(category=>category.id===item.concept||related.includes(category.id)).map(category=>category.label).join(' ');
  const haystack=[item.title,item.id,labels,item.variationLabel,item.description,item.concept,item.location,item.placement,item.fieldingMethod,item.related,item.displayCode].join(' ').toLowerCase();
  return (!q.trim()||haystack.includes(q.trim().toLowerCase()))&&(!type||item.type===type)
   &&(!difficulty||item.difficulty===difficulty)&&(!outcome||item.hitOutcome===outcome)
   &&(!ball||item.ballType===ball)&&(!location||item.location===location)
   &&(!concept||item.concept===concept||related.includes(concept))
   &&(outs===''||Number(item.outs)===Number(outs))
   &&(runners===''||(runners==='on'?item.runners!==0:item.runners===Number(runners==='empty'?0:runners)));
 });
}
function timestamp(value){
 const normalized=String(value||'').replace(' ','T');
 return Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized)?normalized:normalized+'Z')||0;
}
export function sortLibraryItems(items,sort='starting'){
 return [...items].sort((a,b)=>{
  if(sort==='starting')return compareLibraryOrder(a,b);
  const delta=sort==='title'?a.title.toLowerCase().localeCompare(b.title.toLowerCase()):
   timestamp(sort==='created'?b.createdAt:b.updatedAt)-timestamp(sort==='created'?a.createdAt:a.updatedAt);
  return delta||a.title.localeCompare(b.title)||a.type.localeCompare(b.type)||a.id.localeCompare(b.id);
 });
}
