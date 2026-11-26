import { test, expect } from '@playwright/test';

test('Organization uses the shared sidebar and keeps management pages inside the viewport',async({page,baseURL},testInfo)=>{
 const headers={Origin:new URL(baseURL).origin};
 expect((await page.request.post('/api/auth/login',{headers,data:{username:'admin',password:'password'}})).ok()).toBe(true);
 const post=async(url,data)=>{const response=await page.request.post(url,{headers,data});expect(response.ok()).toBe(true);return response.json();};
 const organization=await post('/api/admin/workspace-directory',{action:'create_organization',name:'Visual Review Club'});
 const region=await post('/api/admin/workspace-directory',{action:'create_region',organizationId:organization.id,name:'Visual Review Region'});
 await post('/api/admin/teams',{name:'Visual Review Team',seasonName:'Spring 2027',regionId:region.id});
 await page.goto('/');
 await page.evaluate(()=>window.__DIQ_READY__);
 await page.locator('#staffToolsBtn').click();
 await expect(page.locator('body')).toHaveClass(/org-redesign-open/);
 const check=async(name)=>{
  await expect(page.locator('#workspaceSituationToolbar')).toBeHidden();
  const layout=await page.evaluate(()=>{
   const sidebar=document.querySelector('#adminCard > .workspace-sections').getBoundingClientRect();
   const heading=document.querySelector('#adminCard > .workspace-heading').getBoundingClientRect();
   const content=document.getElementById('adminWorkspace').getBoundingClientRect();
   return {sidebarRight:sidebar.right,headingLeft:heading.left,contentLeft:content.left,width:document.documentElement.scrollWidth,viewport:innerWidth};
  });
  expect(layout.headingLeft).toBeGreaterThanOrEqual(layout.sidebarRight-1);
  expect(layout.contentLeft).toBeGreaterThanOrEqual(layout.sidebarRight-1);
  expect(layout.width).toBeLessThanOrEqual(layout.viewport);
  await page.evaluate(async()=>{window.scrollTo(0,0);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  await page.screenshot({path:testInfo.outputPath(name+'.png'),fullPage:true});
 };
 await expect(page.getByRole('table',{name:'Organizations',exact:true})).toBeVisible();
 const create=page.getByRole('button',{name:'+ New organization',exact:true});
 await expect(create).toBeVisible();
 const position=await create.boundingBox();
 const refreshPosition=await page.locator('#orgWorkspaceRefresh').boundingBox();
 expect(Math.abs(position.y-refreshPosition.y)).toBeLessThan(8);
 await expect(page.getByRole('navigation',{name:'Organization lists'}).getByRole('button',{name:'Organizations',exact:true})).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await check('organizations');
 const lists=page.getByRole('navigation',{name:'Organization lists'});
 const tabY=(await lists.boundingBox()).y;
 const hierarchy=page.getByRole('navigation',{name:'Organization hierarchy'});
 const orgRow=page.getByRole('table',{name:'Organizations',exact:true}).getByRole('row').filter({has:page.getByRole('button',{name:'Visual Review Club',exact:true})});
 await orgRow.locator('td').nth(1).click();
 await expect(page.getByRole('table',{name:'Regions',exact:true})).toBeVisible();
 expect((await lists.boundingBox()).y).toBe(tabY);
 await check('regions');
 const regionRow=page.getByRole('table',{name:'Regions',exact:true}).getByRole('row').filter({has:page.getByRole('button',{name:'Visual Review Region',exact:true})});
 await regionRow.getByRole('button',{name:'Actions for Visual Review Region'}).click();
 await expect(page.locator('.org-action-menu:popover-open')).toBeVisible();
 await expect(page.getByRole('table',{name:'Regions',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');
 await regionRow.locator('td').nth(1).click();
 await expect(page.getByRole('table',{name:'Teams',exact:true})).toBeVisible();
 await check('teams');
 const teamRow=page.getByRole('table',{name:'Teams',exact:true}).getByRole('row').filter({has:page.getByRole('button',{name:'Visual Review Team',exact:true})});
 await teamRow.locator('td').nth(1).click();
 await expect(page.locator('#adminTeamRecords')).toBeVisible();
 await check('team-roster');
 for(const [label,file] of [['Create player account','create-player'],['Create coach account','create-coach'],['Add existing player','existing-player'],['Import roster CSV','import-roster']]){
  await page.locator('#adminAddMember').click();
  await page.getByRole('menuitem',{name:label,exact:true}).click();
  await check(file);
  await page.locator('#adminMemberCancel').click();
 }
 for(const [label,file] of [['Seasons','team-seasons']]){
  await page.getByRole('navigation',{name:'Team management sections'}).getByRole('button',{name:label,exact:true}).click();
  if(label==='Seasons'){
   await expect(page.getByRole('table',{name:'Team seasons',exact:true})).toBeVisible();
   await expect(page.locator('#adminAdvanceRosterPanel')).toBeHidden();
   await page.getByRole('button',{name:'Actions for Spring 2027',exact:true}).click();
   await page.locator('.org-action-menu:popover-open').getByRole('button',{name:'Close season',exact:true}).click();
   const closeSeasonDialog=page.getByRole('dialog',{name:'Close season',exact:true});
   await expect(closeSeasonDialog).toContainText('Historical rosters and results remain');
   await closeSeasonDialog.getByRole('button',{name:'Cancel',exact:true}).click();
   await page.getByRole('table',{name:'Team seasons',exact:true}).getByRole('row').filter({has:page.getByRole('button',{name:'Spring 2027',exact:true})}).locator('td').nth(2).click();
   await expect(page.getByRole('table',{name:'Season roster',exact:true})).toBeVisible();
   await expect(page.locator('#orgSeasonDetailTitle')).toHaveText('Spring 2027');
   await check('season-detail');
   await page.getByRole('button',{name:'← Back to seasons',exact:true}).click();
  }
  await check(file);
 }
 await page.locator('.org-context-switcher > summary').click();
 await expect(page.locator('#adminOrganizationList button[aria-current="true"]')).toHaveCSS('border-left-width','0px');
 await page.screenshot({path:testInfo.outputPath('organization-dropdown.png')});
 await page.keyboard.press('Escape');
 await lists.getByRole('button',{name:'Organizations',exact:true}).click();

 for(const name of ['People','Recovery']){
  await page.locator('#org-sections').getByRole('button',{name,exact:true}).click();
  if(name==='People')await expect(page.getByRole('table',{name:'People',exact:true})).toBeVisible();
  if(name==='Recovery'){await expect(page.locator('#adminArchivedMemberSelect')).toBeHidden();await expect(page.getByRole('navigation',{name:'Recovery categories'})).toBeVisible();}
  await check(name==='Recovery'?'recovery':'people');
 }
 await page.locator('#org-sections').getByRole('button',{name:'Organizations',exact:true}).click();
 const directory=page.locator('#adminWorkspaceDirectory');
 await directory.getByRole('button', { name: /^Unassigned teams \(/ }).click();
 await directory.getByRole('button',{name:'13U Orange',exact:true}).click();
 await expect(page.locator('#adminTeamRecords')).toBeVisible();
 await page.getByRole('button',{name:'Roster',exact:true}).click();
 await check('roster');
 await page.getByRole('button',{name:'Seasons',exact:true}).click();
 await check('seasons');
 await page.setViewportSize({width:1024,height:768});
 await check('seasons-1024');
});
