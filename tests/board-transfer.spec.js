import {selectBoardStep,selectStage,addBoardStep} from './helpers/play-library.js';
import {boardAction} from './helpers/play-library.js';
import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {importBoardFile} from '../src/lib/plays/board-transfer.js';
const example=new URL('../docs/examples/wheel-play.board.json',import.meta.url);
async function login(page,baseURL){await page.request.post('/api/auth/login',{headers:{Origin:new URL(baseURL).origin},data:{role:'admin',password:'password'}});}
test('wheel import opens an unsaved draft, saves privately and exports current edits without identity',async({page,baseURL})=>{
 await login(page,baseURL);await page.goto('/coach-board');const library=page.getByRole('dialog');await expect(library).toBeVisible();await expect(library.getByRole('button',{name:'Import Board',exact:true})).toBeVisible();
 const writes=[];page.on('request',r=>{if(r.url().endsWith('/api/boards')&&r.method()==='POST')writes.push(r);});
 await library.getByLabel('Import Board JSON file',{exact:true}).setInputFiles({name:'wheel-play.board.json',mimeType:'application/json',buffer:Buffer.from(readFileSync(example))});
 await expect(library).toHaveCount(0);await expect(page.getByLabel('Board name')).toHaveValue('Wheel Play — Dodgers NLDS Game 2');await expect(page.getByRole('status')).toContainText('new draft');expect(writes).toHaveLength(0);
 const stages=page.getByRole('navigation',{name:'Editor tools'});
 await expect(stages.getByRole('button')).toHaveText(['Details','Play timeline','Review']);
 await expect(page.getByRole('button',{name:'+ Add Step',exact:true})).toBeVisible();
 await selectStage(page,'Review');
 await expect(page.getByRole('region',{name:'Board review'}).getByRole('button',{name:'Present',exact:true})).toBeVisible();
 await selectBoardStep(page,'Before the pitch');await expect(page.getByRole('button',{name:'SS · Movement 1',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Save Board',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Board saved.');expect(writes).toHaveLength(1);
 const saved=(await (await page.request.get('/api/boards')).json()).find(row=>row.board.title==='Wheel Play — Dodgers NLDS Game 2');expect(saved.board.movements.SS[1].durationMs).toBe(850);expect(saved.board.sourceSituation).toBeNull();expect(saved.board.situationMetadata.runnerOutcomes[0].outType).toBe('tag');
 await page.getByLabel('Board name').fill('Wheel Play — exported draft');
 const downloadEvent=page.waitForEvent('download');await boardAction(page,'Export Board');const download=await downloadEvent;
 expect(download.suggestedFilename()).toBe('wheel-play-exported-draft.board.json');const text=readFileSync(await download.path(),'utf8'),exported=importBoardFile(text);
 expect(exported.title).toBe('Wheel Play — exported draft');expect(exported.movements).toEqual(saved.board.movements);expect(exported.situationMetadata.runnerOutcomes[0].outType).toBe('tag');expect(text).not.toContain(saved.id);expect(writes).toHaveLength(1);
});
test('invalid import leaves the current draft intact and cancelling replacement preserves unsaved edits',async({page,baseURL})=>{
 await login(page,baseURL);await page.goto('/coach-board');await page.getByRole('dialog').getByRole('button',{name:'New Board',exact:true}).click();await page.getByLabel('Board name').fill('Keep this draft');await page.getByRole('button',{name:'Back to Library',exact:true}).click();const library=page.getByRole('dialog'),input=library.getByLabel('Import Board JSON file',{exact:true});
 await input.setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{bad')});await expect(library.getByRole('status')).toContainText('valid Board JSON');await expect(library).toBeVisible();await expect(page.getByLabel('Board name')).toHaveValue('Keep this draft');
 page.once('dialog',dialog=>dialog.dismiss());await input.setInputFiles({name:'wheel.json',mimeType:'application/json',buffer:Buffer.from(readFileSync(example))});await expect(library).toBeVisible();await expect(page.getByLabel('Board name')).toHaveValue('Keep this draft');
 await library.getByRole('button',{name:'Close Library',exact:true}).click();await expect(page.getByLabel('Board name')).toHaveValue('Keep this draft');
});

test('a new private Board records contact from a free-form step',async({page,baseURL})=>{
 await login(page,baseURL);
 await page.goto('/coach-board');
 await page.getByRole('dialog').getByRole('button',{name:'New Board',exact:true}).click();
 const title=`Staged Board ${Date.now()}`;
 await selectStage(page,'Details');
 await page.getByLabel('Board name').fill(title);
 await addBoardStep(page);
 await page.getByRole('button',{name:'Set batted ball',exact:true}).click();
 await page.getByLabel('Batted-ball type').selectOption('line_drive');
 await page.getByRole('combobox',{name:'Hit result',exact:true}).selectOption('single');
 await page.getByRole('button',{name:'Set batted-ball destination',exact:true}).click({position:{x:180,y:180}});

 await expect(page.getByRole('button',{name:'Edit batted ball action',exact:true})).toBeVisible();
 await selectStage(page,'Review');
 await page.getByRole('button',{name:'Save Board',exact:true}).click();
 await expect(page.getByRole('status')).toHaveText('Board saved.');
 const saved=(await (await page.request.get('/api/boards')).json()).find(row=>row.board.title===title);
 expect(saved.board.battedBall).toMatchObject({type:'line_drive',stepId:saved.board.steps[0].id});
 expect(saved.board.sourceSituation).toBeNull();
});
