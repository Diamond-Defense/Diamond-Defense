import {selectBoardStep,openRunnerAdvances} from './helpers/play-library.js';
import {test,expect} from '@playwright/test';
import {openLibraryPlay,boardAction} from './helpers/play-library.js';
import {newBoard,clone} from '../src/lib/plays/board.js';
import {compilePlay} from '../src/lib/plays/animation.js';
async function load(page,baseURL){
 await page.request.post('/api/auth/login',{headers:{Origin:new URL(baseURL).origin},data:{role:'admin',password:'password'}});
 const board=newBoard();board.title=`Timing and undo ${Date.now()}`;board.battedBall={type:'line_drive',start:clone(board.runners.batter),destination:{x:1300,y:900}};board.playSeq=['SS','2B'];board.movements.SS=[{path:[clone(board.defenders.SS),clone(board.battedBall.destination)],start:{event:'contact'}}];
 const response=await page.request.post('/api/boards',{headers:{Origin:new URL(baseURL).origin},data:{board}});expect(response.status()).toBe(201);const saved=await response.json();await page.goto('/coach-board?edit=1');await openLibraryPlay(page,'board',saved.id,board.title);return {board,saved};
}
async function movement(page){await selectBoardStep(page,'Contact');await page.getByRole('button',{name:'SS · Movement 1',exact:true}).click();}
test('custom timing saves, reloads, delays fielding and supports undo and redo',async({page,baseURL})=>{
 const {board,saved}=await load(page,baseURL);await movement(page);const timing=page.getByRole('combobox',{name:'Movement timing',exact:true}),duration=page.getByRole('spinbutton',{name:'Duration at Normal speed (seconds)',exact:true}),undo=page.getByRole('button',{name:'Undo',exact:true}),redo=page.getByRole('button',{name:'Redo',exact:true});
 await expect(undo).toBeDisabled();await timing.selectOption('custom');await duration.fill('20');await duration.press('Tab');await expect(duration).toHaveValue('20');await undo.click();await expect(duration).toHaveValue('2');await redo.click();await expect(duration).toHaveValue('20');
 await page.getByRole('button',{name:'Save Board',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Board saved.');const stored=(await (await page.request.get('/api/boards')).json()).find(item=>item.id===saved.id);expect(stored.board.movements.SS[0].durationMs).toBe(5000);
 await page.reload();await openLibraryPlay(page,'board',saved.id,board.title);await movement(page);await expect(duration).toHaveValue('20');await expect(undo).toBeDisabled();
 await selectBoardStep(page,'Contact');await page.getByRole('button',{name:'Batted ball',exact:true}).click();await expect(page.getByRole('note')).toHaveCount(0);await expect(page.getByText('SS fields the ball after 20.0 seconds from contact at Normal speed.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Present',exact:true}).click();const controls=page.getByRole('region',{name:'Presentation controls'}),play=compilePlay(stored.board,{coachBoard:true});
 for(let i=1;i<play.steps.length;i++){await controls.getByRole('button',{name:'Next Step',exact:true}).click();if(play.steps[i]===play.contactTime+5000){await expect(controls.getByRole('status')).toContainText('Ball fielded');break;}}
 await expect(page.getByRole('group',{name:'Edit history'})).toBeHidden();
});
test('undo restores deleted routes, groups pointer drags and clears redo after branching',async({page,baseURL})=>{
 const {board,saved}=await load(page,baseURL);await movement(page);const undo=page.getByRole('button',{name:'Undo',exact:true}),redo=page.getByRole('button',{name:'Redo',exact:true});
 await page.getByRole('button',{name:'Delete Movement',exact:true}).click();await undo.click();await page.getByRole('button',{name:'SS · Movement 1',exact:true}).click();await expect(page.getByRole('combobox',{name:'Movement timing',exact:true})).toHaveValue('automatic');await redo.click();await expect(page.getByRole('combobox',{name:'Movement timing',exact:true})).toHaveCount(0);await undo.click();
 await page.getByRole('button',{name:'Add movement',exact:true}).click();
 const token=page.getByRole('button',{name:'SS token',exact:true});await token.scrollIntoViewIfNeeded();const box=await token.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+100,box.y+40,{steps:10});await page.mouse.up();await expect(redo).toBeDisabled();await undo.click();await expect(redo).toBeEnabled();
 await page.getByRole('button',{name:'Save Board',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Board saved.');const stored=(await (await page.request.get('/api/boards')).json()).find(item=>item.id===saved.id);expect(stored.board.movements.SS).toEqual(board.movements.SS);
 await redo.click();await page.getByRole('button',{name:'Save Board',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Board saved.');const revised=(await (await page.request.get('/api/boards')).json()).find(item=>item.id===saved.id);expect(revised.id).toBe(saved.id);expect(revised.revision).toBe(stored.revision+1);expect(revised.board.movements.SS).not.toEqual(board.movements.SS);
});

test('title edits, running destinations, runner occupancy and outcome fields share local undo',async({page,baseURL})=>{
 const {board}=await load(page,baseURL),undo=page.getByRole('button',{name:'Undo',exact:true}),redo=page.getByRole('button',{name:'Redo',exact:true});
 await page.getByRole('textbox',{name:'Board name',exact:true}).fill('Changed title');await expect(undo).toBeEnabled();await undo.click();await expect(page.getByRole('textbox',{name:'Board name',exact:true})).toHaveValue(board.title);await redo.click();await expect(page.getByRole('textbox',{name:'Board name',exact:true})).toHaveValue('Changed title');
 await openRunnerAdvances(page);await page.getByRole('combobox',{name:'Hit result',exact:true}).selectOption('double');await undo.click();await expect(page.getByRole('combobox',{name:'Hit result',exact:true})).toHaveValue('single');await redo.click();await expect(page.getByRole('combobox',{name:'Batter destination',exact:true})).toHaveValue('second');
 await page.getByRole('button',{name:'Starting alignment',exact:true}).click();await page.getByRole('checkbox',{name:'first',exact:true}).check();await undo.click();await expect(page.getByRole('checkbox',{name:'first',exact:true})).not.toBeChecked();await redo.click();await expect(page.getByRole('checkbox',{name:'first',exact:true})).toBeChecked();
 await boardAction(page,'Save as Situation');await page.getByRole('combobox',{name:'Play result',exact:true}).selectOption('triple');await undo.click();await expect(page.getByRole('combobox',{name:'Play result',exact:true})).toHaveValue('double');await redo.click();await expect(page.getByRole('combobox',{name:'Play result',exact:true})).toHaveValue('triple');
});
