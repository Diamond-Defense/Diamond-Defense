import {test,expect} from '@playwright/test';
import {openLibraryPlay,boardAction} from './helpers/play-library.js';
async function login(page,baseURL){await page.request.post('/api/auth/login',{headers:{Origin:new URL(baseURL).origin},data:{role:'admin',password:'password'}});}
test('editing tools precede a compact preview and secondary actions stay collapsed',async({page,baseURL})=>{
 await login(page,baseURL);await page.setViewportSize({width:1280,height:900});await page.goto('/coach-board?edit=1');
 const tools=page.getByRole('complementary',{name:'Coach Board tools'}),preview=page.getByRole('region',{name:'Playback controls'});
 await expect(page.getByRole('button',{name:'Save Board',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Export Board',exact:true})).toBeHidden();await expect(page.getByRole('button',{name:'Pause',exact:true})).toHaveCount(0);
 await expect(preview.getByRole('button',{name:'Previous Step',exact:true})).toBeHidden();await expect(preview.getByRole('checkbox',{name:'Show Targets',exact:true})).toBeHidden();
 const setup=await tools.getByRole('button',{name:'Setup',exact:true}).boundingBox(),play=await preview.getByRole('button',{name:'Play',exact:true}).boundingBox();expect(setup.y).toBeLessThan(play.y);
 await page.getByLabel('More actions',{exact:true}).click();await expect(page.getByRole('button',{name:'Export Board',exact:true})).toBeVisible();await page.getByRole('heading',{name:'Coach Board',exact:true}).click();await expect(page.getByRole('button',{name:'Export Board',exact:true})).toBeHidden();
 await preview.getByText('Preview options',{exact:true}).click();await expect(preview.getByRole('checkbox',{name:'Show Targets',exact:true})).toBeVisible();await preview.getByText('Preview options',{exact:true}).click();
 await page.screenshot({path:'/tmp/coach-sidebar-1280.png',fullPage:true});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'/tmp/coach-sidebar-390.png',fullPage:true});
});
test('Situation editing uses one primary save and Board copy becomes a separate private draft',async({page,baseURL})=>{
 await login(page,baseURL);const original=(await (await page.request.get('/api/situations')).json()).find(item=>item.hit);
 await page.goto('/coach-board?edit=1');await openLibraryPlay(page,'situation',original.key,original.title);
 await expect(page.getByRole('button',{name:'Save Situation Changes',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Save Board',exact:true})).toHaveCount(0);
 const writes=[];page.on('request',r=>{if(['POST','PUT','DELETE'].includes(r.method()))writes.push(r.url());});const title=`Private sidebar copy ${Date.now()}`;page.once('dialog',dialog=>dialog.accept(title));await boardAction(page,'Save a Board Copy');
 await expect(page.getByRole('textbox',{name:'Board name',exact:true})).toHaveValue(title);await expect(page.getByRole('button',{name:'Save Board',exact:true})).toBeVisible();expect(writes).toEqual([]);
 await page.getByRole('button',{name:'Save Board',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Board saved.');expect(writes).toHaveLength(1);expect(writes[0]).toMatch(/\/api\/boards$/);
 const saved=(await (await page.request.get('/api/boards')).json()).find(item=>item.board.title===title);expect(saved.board.sourceSituation).toBeNull();expect(saved.board.movements).toBeDefined();expect((await (await page.request.get('/api/situations')).json()).find(item=>item.key===original.key)).toEqual(original);
});
