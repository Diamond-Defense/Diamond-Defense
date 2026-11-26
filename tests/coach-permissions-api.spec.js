import {test,expect,request as requests} from '@playwright/test';
test('Designer grants are scoped and revocable without removing Training access',async({request,baseURL})=>{
 const headers={Origin:new URL(baseURL).origin},directory='/api/admin/workspace-directory';
 expect((await request.post('/api/auth/login',{headers,data:{username:'admin',password:'password'}})).ok()).toBe(true);
 const id='permissions-'+crypto.randomUUID(),coach=await requests.newContext({baseURL});
 const teamResponse=await request.post('/api/admin/teams',{headers,data:{id,name:id}});
 expect(teamResponse.status()).toBe(201);const team=(await teamResponse.json()).record;
 expect((await request.post(`/api/admin/teams/${id}/members`,{headers,data:{userId:id+'-coach',name:'Scoped coach',role:'coach',password:'Initial-4821'}})).status()).toBe(201);
 const grant=canDesign=>request.post(directory,{headers,data:{action:'stage_access',userId:id+'-coach',role:'coach',scopeId:id,canDesign}});
 try {
  expect((await coach.post('/api/auth/login',{headers,data:{role:'coach',teamId:id,coachId:id+'-coach',password:'Initial-4821'}})).ok()).toBe(true);
  expect((await coach.put('/api/auth/password',{headers,data:{currentPassword:'Initial-4821',newPassword:'Permanent-4821'}})).ok()).toBe(true);
  expect((await coach.get('/api/design')).status()).toBe(403);
  expect((await coach.get('/api/training/scopes')).ok()).toBe(true);
  expect((await request.put(`/api/admin/users/${id}-coach/permissions`,{headers,data:{canPublishSituations:true}})).status()).toBe(410);
  expect((await grant(true)).ok()).toBe(true);
  expect((await (await coach.get('/api/auth/session')).json()).user.canAccessDesign).toBe(true);
  expect((await (await coach.get('/api/design')).json()).workspaces).toEqual([expect.objectContaining({type:'team',id,canDesign:true})]);
  expect((await coach.get('/api/design?type=global')).status()).toBe(403);
  expect((await coach.post('/api/design',{headers,data:{action:'global_visibility',type:'global',id:'',keys:['BD-01'],hidden:true}})).status()).toBe(403);
  expect((await grant(false)).ok()).toBe(true);
  expect((await (await coach.get('/api/auth/session')).json()).user.canAccessDesign).toBe(false);
  expect((await coach.get('/api/design?type=team&id='+id)).status()).toBe(403);
  expect((await coach.post('/api/design',{headers,data:{action:'global_visibility',type:'team',id,keys:['BD-01'],hidden:true}})).status()).toBe(403);
  expect((await coach.get('/api/training/scopes')).ok()).toBe(true);
  expect((await coach.get(`/api/reports/team/${id}`)).ok()).toBe(true);
 }finally{await coach.dispose();await request.delete(`/api/admin/teams/${id}`,{headers:{...headers,'If-Match':String(team.revision)}});}
});
