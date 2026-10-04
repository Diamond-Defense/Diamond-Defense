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
 await page.getByRole('button',{name:'Movement',exact:true}).click();await page.getByRole('combobox',{name:'Token',exact:true}).selectOption('SS');await expect(page.getByRole('combobox',{name:'Movement',exact:true}).locator('option')).toHaveCount(2);
 await page.getByRole('button',{name:'Save Board',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Board saved.');expect(writes).toHaveLength(1);
 const saved=(await (await page.request.get('/api/boards')).json()).find(row=>row.board.title==='Wheel Play — Dodgers NLDS Game 2');expect(saved.board.movements.SS[1].durationMs).toBe(850);expect(saved.board.sourceSituation).toBeNull();expect(saved.board.situationMetadata.runnerOutcomes[0].outType).toBe('tag');
 await page.getByLabel('Board name').fill('Wheel Play — exported draft');
 const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Export Board',exact:true}).click();const download=await downloadEvent;
 expect(download.suggestedFilename()).toBe('wheel-play-exported-draft.board.json');const text=readFileSync(await download.path(),'utf8'),exported=importBoardFile(text);
 expect(exported.title).toBe('Wheel Play — exported draft');expect(exported.movements).toEqual(saved.board.movements);expect(exported.situationMetadata.runnerOutcomes[0].outType).toBe('tag');expect(text).not.toContain(saved.id);expect(writes).toHaveLength(1);
});
test('invalid import leaves the current draft intact and cancelling replacement preserves unsaved edits',async({page,baseURL})=>{
 await login(page,baseURL);await page.goto('/coach-board');await page.getByRole('dialog').getByRole('button',{name:'New Board',exact:true}).click();await page.getByLabel('Board name').fill('Keep this draft');await page.getByRole('button',{name:'Browse Library',exact:true}).click();const library=page.getByRole('dialog'),input=library.getByLabel('Import Board JSON file',{exact:true});
 await input.setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{bad')});await expect(library.getByRole('status')).toContainText('valid Board JSON');await expect(library).toBeVisible();await expect(page.getByLabel('Board name')).toHaveValue('Keep this draft');
 page.once('dialog',dialog=>dialog.dismiss());await input.setInputFiles({name:'wheel.json',mimeType:'application/json',buffer:Buffer.from(readFileSync(example))});await expect(library).toBeVisible();await expect(page.getByLabel('Board name')).toHaveValue('Keep this draft');
 await library.getByRole('button',{name:'Close Library',exact:true}).click();await expect(page.getByLabel('Board name')).toHaveValue('Keep this draft');
});
