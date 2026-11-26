import {SqliteSituationRepository} from '$lib/server/repositories/situations';
import type {Situation} from '$lib/domain/models';
import {libraryCardModel,compareLibraryOrder} from '$lib/plays/library-card.js';
import {error,json} from '@sveltejs/kit';
import type {RequestHandler} from './$types';
import {databaseFor} from '$lib/server/database/context';
import {requireUser} from '$lib/server/security/authorization';

export const GET:RequestHandler=async event=>{
 const user=await requireUser(event,['coach','admin']);
 const p=event.url.searchParams;
 const type=p.get('type')||'';const ball=p.get('ball')||'';const sort=p.get('sort')||'starting';
 if(!['','board','situation'].includes(type)||!['','ground_ball','line_drive','air_ball'].includes(ball)||!['starting','updated','created','title'].includes(sort))throw error(400,'Invalid library filter.');
 const numeric=(name:string,max:number)=>{const raw=p.get(name);if(raw===null||raw==='')return null;if(!/^\d+$/.test(raw)||Number(raw)>max)throw error(400,`Invalid ${name} filter.`);return Number(raw);};
 const mask=numeric('runners',7),outs=numeric('outs',2),offset=numeric('offset',1000000)||0;
 const limit=Math.max(1,Math.min(50,numeric('limit',50)??20));
 const q=(p.get('q')||'').trim();if(q.length>120)throw error(400,'Search must be 120 characters or fewer.');
 const location=(p.get('location')||'').slice(0,80),concept=(p.get('concept')||'').slice(0,80);
 const base=`WITH content AS (
 SELECT 'board' AS type,id,title,'' AS description,revision,created_at AS createdAt,updated_at AS updatedAt,'' AS displayCode,
 (CASE WHEN json_type(payload_json,'$.runners.first')='object' THEN 1 ELSE 0 END+CASE WHEN json_type(payload_json,'$.runners.second')='object' THEN 2 ELSE 0 END+CASE WHEN json_type(payload_json,'$.runners.third')='object' THEN 4 ELSE 0 END) AS runners,
 json_extract(payload_json,'$.outs') AS outs,
 CASE json_extract(payload_json,'$.battedBall.type') WHEN 'ground_ball' THEN 'ground_ball' WHEN 'line_drive' THEN 'line_drive' WHEN 'fly_ball' THEN 'air_ball' WHEN 'pop_fly' THEN 'air_ball' ELSE '' END AS ballType,
 '' AS location,'' AS concept,'[]' AS related,payload_json AS payload
 FROM coach_boards WHERE owner_id=?1
 UNION ALL
 SELECT 'situation',key,title,description,revision,created_at,updated_at,display_code,
 (CASE WHEN json_extract(payload_json,'$.runnersOn.first') THEN 1 ELSE 0 END+CASE WHEN json_extract(payload_json,'$.runnersOn.second') THEN 2 ELSE 0 END+CASE WHEN json_extract(payload_json,'$.runnersOn.third') THEN 4 ELSE 0 END),
 json_extract(payload_json,'$.outs'),
 CASE json_extract(payload_json,'$.hitType') WHEN 'grounder' THEN 'ground_ball' WHEN 'line' THEN 'line_drive' WHEN 'popup' THEN 'air_ball' ELSE '' END,
 coalesce(json_extract(payload_json,'$.ballLocation'),''),coalesce((SELECT category_id FROM situation_teaching_categories WHERE situation_key=situations.key AND is_primary=1),''),
 (SELECT json_group_array(category_id) FROM situation_teaching_categories WHERE situation_key=situations.key AND is_primary=0),payload_json
 FROM situations WHERE active=1 AND library_scope='global'
 )`;
 const db=databaseFor(event);
 // Restrict visibility in SQL first. Classify once per visible record, then search,
 // count and paginate the same models used by both card views. Avoid expanding
 // the nearest-anchor calculation into a very large SQL expression.
 const rows=await db.all<Record<string, any>>(`${base} SELECT * FROM content`,[user.id]);
 const parsed=rows.map(({payload,...item})=>({item,record:JSON.parse(String(payload))}));
 const tagged=await new SqliteSituationRepository(db).withTags(parsed.filter(entry=>entry.item.type==='situation').map(entry=>entry.record as Situation));
 const byKey=new Map(tagged.map(record=>[record.key,record]));
 const visible=parsed.map(({item,record})=>libraryCardModel(item.type==='situation'?byKey.get(record.key)||record:record,item.type,item));
 const filtered=visible.filter(item=>{
  const haystack=[item.title,item.variationLabel,item.description,item.concept,item.location,item.placement,item.fieldingMethod,item.related,item.displayCode].join(' ').toLowerCase();
  const related=JSON.parse(item.related||'[]');
  return (!type||item.type===type)&&(!ball||item.ballType===ball)&&(mask===null||item.runners===mask)
   &&(outs===null||Number(item.outs)===outs)&&(!location||item.location===location)
   &&(!concept||item.concept===concept||related.includes(concept))&&(!q||haystack.includes(q.toLowerCase()));
 });
 filtered.sort((a,b)=>{
  if(sort==='starting')return compareLibraryOrder(a,b);
  const delta=sort==='title'?a.title.toLowerCase().localeCompare(b.title.toLowerCase()):
   (Date.parse(sort==='created'?b.createdAt:b.updatedAt)||0)-(Date.parse(sort==='created'?a.createdAt:a.updatedAt)||0);
  return delta||a.title.toLowerCase().localeCompare(b.title.toLowerCase())||a.type.localeCompare(b.type)||a.id.localeCompare(b.id);
 });
 return json({items:filtered.slice(offset,offset+limit),total:filtered.length,offset,limit},{headers:{'Cache-Control':'private, no-store'}});
};
