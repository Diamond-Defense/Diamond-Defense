import {openLibraryPlay} from './helpers/play-library.js';
import {test,expect} from '@playwright/test';
import {fromSituation} from '../src/lib/plays/board.js';
test('Coach Board edits preserve structured details and publish the same Situation identity',async({page,baseURL})=>{
 test.setTimeout(30000);const headers={Origin:new URL(baseURL).origin};await page.request.post('/api/auth/login',{headers,data:{role:'admin',password:'password'}});
 const source=(await (await page.request.get('/api/situations')).json())[0];
 const input={...source,key:`unified-${Date.now()}`,title:`Unified ${Date.now()}`,revision:undefined,displayCode:undefined,extension:{keep:'round-trip'}};
 input.playSeq2=['RF','2B'];
 const board=fromSituation(input),start=board.defenders.SS,middle={x:start.x+60,y:start.y-50};
 board.movements.SS=[{path:[start,middle],start:{event:'contact'}},{path:[middle,{x:middle.x+50,y:middle.y-40},{x:input.targets.SS.x,y:input.targets.SS.y}],start:{event:'ball_fielded'}}];
 input.boardAnimation={version:2,movements:board.movements,battedBall:board.battedBall};
 const created=await page.request.post('/api/situations',{headers,data:input});expect(created.status()).toBe(201);let record=(await created.json()).record;
 const count=(await (await page.request.get('/api/situations')).json()).length;
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto('/coach-board?edit=1');await openLibraryPlay(page,'situation',record.key,record.title);
  await page.getByLabel('Board name').fill('Unsaved visual name');
  await expect(page.getByRole('button',{name:'Situation Details',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'New Board',exact:true})).toHaveCount(0);
  expect((await (await page.request.get('/api/situations')).json()).length).toBe(count);await page.getByLabel('Board name').fill('Structured and visual draft');
  await expect(page.getByLabel('Board name')).toHaveValue('Structured and visual draft');
  await page.getByRole('button',{name:'Movement',exact:true}).click();await page.getByRole('combobox',{name:'Token',exact:true}).selectOption('SS');await expect(page.getByRole('combobox',{name:'Movement',exact:true}).locator('option')).toHaveCount(2);
  await page.getByRole('button',{name:'Browse Library',exact:true}).click();page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('dialog').getByRole('button',{name:'New Board',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Close Library'}).click();await expect(page.getByLabel('Board name')).toHaveValue('Structured and visual draft');
  await page.getByRole('button',{name:'Save Situation Changes',exact:true}).click();await expect(page.getByRole('region',{name:'Playback controls'})).toHaveCount(0);await page.getByRole('button',{name:'Publish Situation',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Situation changes saved.');
  const records=await (await page.request.get('/api/situations')).json();expect(records.length).toBe(count);const saved=records.find(s=>s.key===record.key);expect(saved.revision).toBe(record.revision+1);expect(saved.displayCode).toBe(record.displayCode);expect(saved.title).toBe('Structured and visual draft');expect(saved.targets).toEqual(record.targets);expect(saved.extension).toEqual(record.extension);expect(saved.playSeq2).toEqual(record.playSeq2);expect(saved.boardAnimation.movements.SS).toEqual(record.boardAnimation.movements.SS);record=saved;expect(errors).toEqual([]);
 }finally{await page.request.delete(`/api/situations/${record.key}`,{headers:{...headers,'If-Match':String(record.revision)}});}
});

test('legacy edits keep identity and stale revisions leave the unsaved draft intact',async({page,baseURL})=>{
 const headers={Origin:new URL(baseURL).origin};await page.request.post('/api/auth/login',{headers,data:{role:'admin',password:'password'}});const source=(await (await page.request.get('/api/situations')).json()).find(s=>!s.boardAnimation);
 const created=await page.request.post('/api/situations',{headers,data:{...source,key:`legacy-unified-${Date.now()}`,title:`Legacy unified ${Date.now()}`,revision:undefined,displayCode:undefined}});expect(created.status()).toBe(201);let record=(await created.json()).record;
 try{
  await page.goto('/coach-board?edit=1');await openLibraryPlay(page,'situation',record.key,record.title);await page.getByLabel('Board name').fill('My pending changes');
  const updated=await page.request.put(`/api/situations/${record.key}`,{headers:{...headers,'If-Match':String(record.revision)},data:{...record,desc:'Concurrent edit'}});expect(updated.ok()).toBeTruthy();record=(await updated.json()).record;
  await page.getByRole('button',{name:'Save Situation Changes',exact:true}).click();await page.getByRole('button',{name:'Publish Situation',exact:true}).click();await expect(page.getByRole('status')).toContainText('changed');await expect(page.getByLabel('Board name')).toHaveValue('My pending changes');expect((await (await page.request.get('/api/situations')).json()).find(s=>s.key===record.key).title).toBe(record.title);
 }finally{await page.request.delete(`/api/situations/${record.key}`,{headers:{...headers,'If-Match':String(record.revision)}});}
});

test('coach visual changes submit for review and preserve animation on approval',async({page,request,baseURL})=>{
 const headers={Origin:new URL(baseURL).origin};await request.post('/api/auth/login',{headers,data:{role:'admin',password:'password'}});
 const source=(await (await request.get('/api/situations')).json())[0];const created=await request.post('/api/situations',{headers,data:{...source,key:`coach-unified-${Date.now()}`,title:`Coach unified ${Date.now()}`,revision:undefined,displayCode:undefined}});expect(created.status()).toBe(201);let record=(await created.json()).record;
 await page.request.post('/api/auth/login',{headers,data:{role:'coach',teamId:'13u-black',coachId:'staff-coach',password:'password'}});
 try{
  await page.goto('/coach-board?edit=1');await openLibraryPlay(page,'situation',record.key,record.title);await page.getByLabel('Board name').fill('Coach visual proposal');
  await page.getByRole('button',{name:'Save Situation Changes',exact:true}).click();await expect(page.getByRole('button',{name:'Publish Situation',exact:true})).toHaveCount(0);await page.getByLabel('Proposal reason').fill('Demonstrates the defensive responsibilities.');await page.getByRole('button',{name:'Submit for Review',exact:true}).click();await expect(page.getByRole('status')).toContainText('Proposal submitted');
  const submission=(await (await page.request.get('/api/situation-submissions')).json()).submissions.find(s=>s.situationKey===record.key);expect(submission.submissionType).toBe('update');expect(submission.situation.boardAnimation.version).toBe(2);
  expect((await page.request.put(`/api/situations/${record.key}`,{headers:{...headers,'If-Match':String(record.revision)},data:submission.situation})).status()).toBe(403);
  const approved=await request.put(`/api/admin/situation-submissions/${submission.id}`,{headers,data:{decision:'approve',acceptedFields:['title','boardAnimation'],notes:'Approved'}});expect(approved.ok()).toBeTruthy();record=(await (await request.get('/api/situations')).json()).find(s=>s.key===record.key);expect(record.title).toBe('Coach visual proposal');expect(record.boardAnimation).toEqual(submission.situation.boardAnimation);
 }finally{await request.delete(`/api/situations/${record.key}`,{headers:{...headers,'If-Match':String(record.revision)}});}
});

test('a new Situation draft creates its first record only when published from Coach Board',async({page,baseURL})=>{
 const headers={Origin:new URL(baseURL).origin};const login=await page.request.post('/api/auth/login',{headers,data:{role:'admin',password:'password'}});const user=(await login.json()).user;
 const records=await (await page.request.get('/api/situations')).json(),source=records[0];const draft={...source,key:`new-draft-${Date.now()}`,title:`New draft ${Date.now()}`,revision:undefined,displayCode:undefined};
 await page.goto('/coach-board?edit=1');await page.evaluate(({draft,userId})=>sessionStorage.setItem('diq-situation-authoring-v1',JSON.stringify({version:1,userId,destination:'board',situation:draft,baseline:draft,createdAt:Date.now()})),{draft,userId:user.id});await page.reload();await expect(page.getByLabel('Board name')).toHaveValue(draft.title);
 expect((await (await page.request.get('/api/situations')).json()).some(s=>s.key===draft.key)).toBe(false);
 await page.getByRole('button',{name:'Save Situation Changes',exact:true}).click();await page.getByRole('button',{name:'Publish Situation',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Situation changes saved.');const saved=(await (await page.request.get('/api/situations')).json()).find(s=>s.key===draft.key);expect(saved.revision).toBe(1);await page.request.delete(`/api/situations/${saved.key}`,{headers:{...headers,'If-Match':'1'}});
});
