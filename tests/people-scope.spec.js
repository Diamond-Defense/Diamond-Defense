import { test, expect, request } from '@playwright/test';

test('People follows current director scope after transfers and keeps only local season history',async({baseURL})=>{
 const headers={Origin:new URL(baseURL).origin};const admin=await request.newContext({baseURL});const contexts=[admin];
 const stamp=Date.now();
 const post=async(client,url,data)=>{const response=await client.post(url,{headers,data});expect(response.ok(),await response.text()).toBe(true);return response.json();};
 try{
  await post(admin,'/api/auth/login',{username:'admin',password:'password'});
  const org=await post(admin,'/api/admin/workspace-directory',{action:'create_organization',name:'Scope club '+stamp});
  const outside=await post(admin,'/api/admin/workspace-directory',{action:'create_organization',name:'Outside club '+stamp});
  const region=await post(admin,'/api/admin/workspace-directory',{action:'create_region',organizationId:org.id,name:'North '+stamp});
  const sibling=await post(admin,'/api/admin/workspace-directory',{action:'create_region',organizationId:org.id,name:'South '+stamp});
  const other=await post(admin,'/api/admin/workspace-directory',{action:'create_region',organizationId:outside.id,name:'Outside '+stamp});
  const team=async(name,regionId)=>(await post(admin,'/api/admin/teams',{name:name+' '+stamp,regionId,seasonName:'Scope season'})).record;
  const first=await team('North first',region.id),second=await team('North second',region.id),south=await team('South',sibling.id),destination=await team('Outside',other.id);
  const director=async(role,scopeId,label)=>{
   const created=await post(admin,'/api/admin/workspace-directory',{action:'create_staff',name:label+' '+stamp,password:'Temporary-4821',role,scopeId,canDesign:false});
   const client=await request.newContext({baseURL});contexts.push(client);await post(client,'/api/auth/login',{username:created.username,password:'Temporary-4821'});
   const changed=await client.put('/api/auth/password',{headers,data:{currentPassword:'Temporary-4821',newPassword:'Director-Password-123'}});expect(changed.ok()).toBe(true);return client;
  };
  const orgDirector=await director('organization_director',org.id,'Org director'),regionalDirector=await director('regional_director',region.id,'Regional director'),outsideDirector=await director('organization_director',outside.id,'Outside director');
  const player=(await post(admin,`/api/admin/teams/${first.id}/members`,{role:'player',name:'Scope player '+stamp,number:'84',password:'Temporary-4821'})).record;
  const directory=async(client)=>(await client.get('/api/admin/workspace-directory')).json();
  const visible=async(client)=>(await directory(client)).accounts.some(account=>account.id===player.playerId);
  const transfer=target=>post(admin,`/api/admin/players/${player.playerId}/transfer`,{destinationTeamId:target.id,number:'84'});
  expect(await visible(orgDirector)).toBe(true);expect(await visible(regionalDirector)).toBe(true);
  await transfer(second);expect(await visible(orgDirector)).toBe(true);expect(await visible(regionalDirector)).toBe(true);
  await transfer(south);expect(await visible(orgDirector)).toBe(true);expect(await visible(regionalDirector)).toBe(false);
  const scoped=await directory(regionalDirector);expect(scoped.accountMemberships.some(member=>member.userId===player.playerId)).toBe(false);
  const history=await (await regionalDirector.get(`/api/admin/teams/${first.id}/seasons`)).json();expect(history.members.some(member=>member.userId===player.playerId)).toBe(true);
  const currentTeams=await (await regionalDirector.get('/api/admin/teams?includeArchived=true')).json();expect(currentTeams.teams.flatMap(team=>team.roster).some(member=>member.playerId===player.playerId)).toBe(false);
  const remove=async(team)=>{const all=await (await admin.get('/api/admin/teams?includeArchived=true')).json();const member=all.teams.find(item=>item.id===team.id).roster.find(item=>item.playerId===player.playerId);const response=await admin.delete(`/api/admin/teams/${team.id}/members/${player.playerId}`,{headers:{...headers,'If-Match':String(member.revision)}});expect(response.ok()).toBe(true);};
  await remove(south);expect(await visible(orgDirector)).toBe(true);expect(await visible(regionalDirector)).toBe(false);
  await post(admin,`/api/admin/teams/${south.id}/members/existing`,{userId:player.playerId,number:'84'});
  await transfer(destination);expect(await visible(orgDirector)).toBe(false);expect(await visible(outsideDirector)).toBe(true);
  await remove(destination);expect(await visible(orgDirector)).toBe(false);expect(await visible(outsideDirector)).toBe(true);expect(await visible(admin)).toBe(true);
 }finally{for(const client of contexts)await client.dispose();}
});
