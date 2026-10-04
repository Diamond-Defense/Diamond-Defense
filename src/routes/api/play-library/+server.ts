import {error,json} from '@sveltejs/kit';
import type {RequestHandler} from './$types';
import {databaseFor} from '$lib/server/database/context';
import {requireUser} from '$lib/server/security/authorization';

export const GET:RequestHandler=async event=>{
 const user=await requireUser(event,['coach','admin']);
 const p=event.url.searchParams;
 const type=p.get('type')||'';const ball=p.get('ball')||'';const sort=p.get('sort')||'updated';
 if(!['','board','situation'].includes(type)||!['','ground_ball','line_drive','air_ball'].includes(ball)||!['updated','created','title'].includes(sort))throw error(400,'Invalid library filter.');
 const numeric=(name:string,max:number)=>{const raw=p.get(name);if(raw===null||raw==='')return null;if(!/^\d+$/.test(raw)||Number(raw)>max)throw error(400,`Invalid ${name} filter.`);return Number(raw);};
 const mask=numeric('runners',7),outs=numeric('outs',2),offset=numeric('offset',1000000)||0;
 const limit=Math.max(1,Math.min(50,numeric('limit',50)??20));
 const q=(p.get('q')||'').trim();if(q.length>120)throw error(400,'Search must be 120 characters or fewer.');
 const location=(p.get('location')||'').slice(0,80),concept=(p.get('concept')||'').slice(0,80);
 const params:unknown[]=[user.id];
 const bind=(value:unknown)=>{params.push(value);return `?${params.length}`;};
 const filters:string[]=[];
 if(type)filters.push(`type=${bind(type)}`);
 if(ball)filters.push(`ballType=${bind(ball)}`);
 if(mask!==null)filters.push(`runners=${bind(mask)}`);
 if(outs!==null)filters.push(`outs=${bind(outs)}`);
 if(location)filters.push(`location=${bind(location)}`);
 if(concept)filters.push(`(concept=${bind(concept)} OR EXISTS (SELECT 1 FROM json_each(related) WHERE value=?${params.length}))`);
 // instr treats '%' and '_' literally and never interpolates user input into SQL.
 if(q)filters.push(`instr(lower(title||' '||description||' '||concept||' '||location||' '||related||' '||coalesce(displayCode,'')),lower(${bind(q)}))>0`);
 const base=`WITH content AS (
 SELECT 'board' AS type,id,title,'' AS description,revision,created_at AS createdAt,updated_at AS updatedAt,'' AS displayCode,
 (CASE WHEN json_type(payload_json,'$.runners.first')='object' THEN 1 ELSE 0 END+CASE WHEN json_type(payload_json,'$.runners.second')='object' THEN 2 ELSE 0 END+CASE WHEN json_type(payload_json,'$.runners.third')='object' THEN 4 ELSE 0 END) AS runners,
 json_extract(payload_json,'$.outs') AS outs,
 CASE json_extract(payload_json,'$.battedBall.type') WHEN 'ground_ball' THEN 'ground_ball' WHEN 'line_drive' THEN 'line_drive' WHEN 'fly_ball' THEN 'air_ball' WHEN 'pop_fly' THEN 'air_ball' ELSE '' END AS ballType,
 '' AS location,'' AS concept,'[]' AS related
 FROM coach_boards WHERE owner_id=?1
 UNION ALL
 SELECT 'situation',key,title,description,revision,created_at,updated_at,display_code,
 (CASE WHEN json_extract(payload_json,'$.runnersOn.first') THEN 1 ELSE 0 END+CASE WHEN json_extract(payload_json,'$.runnersOn.second') THEN 2 ELSE 0 END+CASE WHEN json_extract(payload_json,'$.runnersOn.third') THEN 4 ELSE 0 END),
 json_extract(payload_json,'$.outs'),
 CASE json_extract(payload_json,'$.hitType') WHEN 'grounder' THEN 'ground_ball' WHEN 'line' THEN 'line_drive' WHEN 'popup' THEN 'air_ball' ELSE '' END,
 coalesce(json_extract(payload_json,'$.ballLocation'),''),coalesce((SELECT category_id FROM situation_teaching_categories WHERE situation_key=situations.key AND is_primary=1),''),
 (SELECT json_group_array(category_id) FROM situation_teaching_categories WHERE situation_key=situations.key AND is_primary=0)
 FROM situations WHERE active=1
 )`;
 const where=filters.length?` WHERE ${filters.join(' AND ')}`:'';
 const order={updated:'julianday(updatedAt) DESC',created:'julianday(createdAt) DESC',title:'lower(title) ASC'}[sort];
 const db=databaseFor(event);
 const [count,items]=await Promise.all([
 db.one<{total:number}>(`${base} SELECT count(*) AS total FROM content${where}`,params),
 db.all(`${base} SELECT type,id,title,description,revision,createdAt,updatedAt,displayCode,runners,outs,ballType,location,concept FROM content${where} ORDER BY ${order},lower(title),type,id LIMIT ?${params.length+1} OFFSET ?${params.length+2}`,[...params,limit,offset])]);
 return json({items,total:count?.total||0,offset,limit},{headers:{'Cache-Control':'private, no-store'}});
};
