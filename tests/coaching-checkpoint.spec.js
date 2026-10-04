import {openLibraryPlay} from './helpers/play-library.js';
import {test,expect} from '@playwright/test';
import {newBoard,clone} from '../src/lib/plays/board.js';
import {BASES_NATIVE as bases} from '../src/lib/plays/field.js';
import {compilePlay,frameAt} from '../src/lib/plays/animation.js';
import {presentationStatus} from '../src/lib/plays/presentation.js';

function examples(){
 const move=(b,id,to,event='contact',throwIndex)=>{const from=b.movements[id]?.at(-1).path.at(-1)||b.defenders[id]||b.runners[id];(b.movements[id]||=[]).push({path:[clone(from),clone(to)],start:{event,...(throwIndex?{throwIndex}:{})}});};
 const ground=newBoard();ground.title='Checkpoint — ground-ball double play';ground.runners={batter:clone(bases.home),first:clone(bases.first)};ground.battedBall={type:'ground_ball',start:clone(bases.home),destination:{x:1260,y:980}};ground.playSeq=['SS','2B','1B'];move(ground,'SS',ground.battedBall.destination);move(ground,'2B',bases.second);move(ground,'1B',bases.first);move(ground,'CF',{x:1600,y:740});move(ground,'P',{x:2250,y:1390});move(ground,'first',bases.second);move(ground,'batter',bases.first);
 const cutoff=newBoard();cutoff.title='Checkpoint — RF cutoff and runner advance';cutoff.runners={batter:clone(bases.home),first:clone(bases.first)};cutoff.battedBall={type:'line_drive',start:clone(bases.home),destination:{x:2440,y:600}};cutoff.playSeq=['RF','2B','3B'];move(cutoff,'RF',cutoff.battedBall.destination);move(cutoff,'2B',{x:2000,y:850});move(cutoff,'3B',bases.third);move(cutoff,'first',bases.second);move(cutoff,'first',bases.third,'previous_movement');move(cutoff,'batter',bases.first);move(cutoff,'2B',{x:1650,y:980},'throw_received',2);
 const tag=newBoard();tag.title='Checkpoint — caught fly with tag-up';tag.runners={batter:clone(bases.home),third:clone(bases.third)};tag.battedBall={type:'fly_ball',start:clone(bases.home),destination:{x:2400,y:610}};tag.playSeq=['RF','C'];move(tag,'RF',tag.battedBall.destination);move(tag,'CF',{x:2190,y:510});move(tag,'third',bases.home,'ball_fielded');
 return [{board:ground,result:'double_play',batter:'out',outs:'2',runner:'first',runnerResult:'out'},{board:cutoff,result:'single',batter:'first',outs:'0',runner:'first',runnerResult:'third'},{board:tag,result:'sacrifice_fly',batter:'out',outs:'1',runner:'third',runnerResult:'home',tagged:true}];
}
for(const example of examples())test(example.board.title,async({page,baseURL})=>{
 await page.request.post('/api/auth/login',{headers:{Origin:new URL(baseURL).origin},data:{role:'admin',password:'password'}});
 const board=clone(example.board);board.title+=` ${Date.now()}`;const play=compilePlay(board);
 const response=await page.request.post('/api/boards',{headers:{Origin:new URL(baseURL).origin},data:{board}});expect(response.status()).toBe(201);const saved=await response.json();
 await page.goto('/coach-board?edit=1');await openLibraryPlay(page,'board',saved.id,board.title);
 await page.getByRole('button',{name:'Save as Situation',exact:true}).click();await expect(page.getByRole('navigation',{name:'Authoring modes'})).toHaveCount(0);await page.getByRole('combobox',{name:'Play result',exact:true}).selectOption(example.result);await page.getByRole('combobox',{name:'Batter result',exact:true}).selectOption(example.batter);await page.getByRole('combobox',{name:'Outs recorded',exact:true}).selectOption(example.outs);await page.getByRole('combobox',{name:`Runner on ${example.runner}`,exact:true}).selectOption(example.runnerResult);if(example.tagged)await page.getByLabel(`Runner on ${example.runner} tagged up`,{exact:true}).check();await page.getByLabel('I confirm these play and runner outcomes').check();
 const created=page.waitForResponse(r=>r.url().endsWith('/api/situations')&&r.request().method()==='POST');await page.getByRole('button',{name:'Create Situation',exact:true}).click();const published=await created;expect(published.status()).toBe(201);const {record}=await published.json();expect(record.playOutcome.result).toBe(example.result);expect(record.runnerOutcomes[0].result).toBe(example.runnerResult);expect(record.boardAnimation.version).toBe(2);
 await page.getByRole('button',{name:'Back to Board Tools',exact:true}).click();await page.getByRole('button',{name:'Present',exact:true}).click();const controls=page.getByRole('region',{name:'Presentation controls'});
 for(const time of play.steps.slice(1)){await controls.getByRole('button',{name:'Next Step',exact:true}).click();await expect(controls.getByRole('status')).toHaveText(presentationStatus(play,frameAt(play,time)));}
 await expect(controls.getByRole('status')).toContainText('Final state');await controls.getByRole('button',{name:'Replay',exact:true}).click();await expect(controls.getByRole('status')).toHaveText('Starting alignment');await page.getByRole('button',{name:'Exit Presentation',exact:true}).click();await expect(page.getByRole('complementary',{name:'Coach Board tools'})).toBeVisible();
 test.info().annotations.push({type:'checkpoint',description:JSON.stringify({steps:play.steps.length,outcome:record.playOutcome,runner:record.runnerOutcomes[0],tracks:play.tracks.map(t=>({actor:t.id,start:t.start,duration:t.duration}))})});
});
