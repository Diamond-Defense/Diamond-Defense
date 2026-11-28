import {test,expect,request as requests} from '@playwright/test';
test('team hides restrict free play while assigned snapshots stay accessible',async({request,baseURL})=>{
 const origin=new URL(baseURL).origin,headers={Origin:origin},teamId=`playbook-${Date.now()}`,playerId=`${teamId}-player`;
 const player=await requests.newContext({baseURL});
 let team;
 try{
  expect((await request.post('/api/auth/login',{headers,data:{role:'admin',password:'password'}})).ok()).toBeTruthy();
  const created=await request.post('/api/admin/teams',{headers,data:{id:teamId,name:'Situation Library test'}});expect(created.status()).toBe(201);team=(await created.json()).record;
  expect((await request.post(`/api/admin/teams/${teamId}/members`,{headers,data:{userId:playerId,name:'Situation Library player',number:'7',role:'player',password:'Temp-1234'}})).status()).toBe(201);
  expect((await player.post('/api/auth/login',{headers,data:{role:'player',teamId,playerId,password:'Temp-1234'}})).ok()).toBeTruthy();
  expect((await player.put('/api/auth/password',{headers,data:{currentPassword:'Temp-1234',newPassword:'Changed-1234'}})).ok()).toBeTruthy();
  const state=await (await request.get(`/api/teams/${teamId}/playbook`)).json();
  expect(state.keys).toEqual(expect.arrayContaining(['BD-01','BD-02']));
  expect((await player.put(`/api/teams/${teamId}/playbook`,{headers,data:{keys:['BD-01'],revision:state.revision}})).status()).toBe(403);
  expect((await request.put(`/api/teams/${teamId}/playbook`,{headers,data:{keys:['BD-01'],revision:state.revision}})).status()).toBe(410);
  const assignmentResponse=await request.post('/api/practice/assignments',{headers,data:{teamId,title:'Pinned before hiding',playerIds:[playerId],situations:[{situationKey:'BD-02'}],publish:true}});
  expect(assignmentResponse.status()).toBe(201);const assignment=(await assignmentResponse.json()).assignment;
  expect((await request.post('/api/design',{headers,data:{
    action:'inherited_visibility',type:'team',id:teamId,keys:['BD-02'],hidden:true,
  }})).ok()).toBeTruthy();
  const visible=(await (await player.get('/api/situations')).json()).map(item=>item.key);
  expect(visible).toContain('BD-01');
  expect(visible).not.toContain('BD-02');
  expect((await player.post('/api/attempts',{headers,data:{situationKey:'BD-02',phase:1}})).status()).toBe(403);
  const started=await player.post(`/api/practice/assignments/${assignment.id}/start`,{headers});expect(started.ok()).toBeTruthy();
  const stateAfter=await started.json();expect(JSON.stringify(stateAfter)).toContain('BD-02');
  expect((await (await player.get('/api/situations')).json()).map(item=>item.key)).not.toContain('BD-02');
 }finally{
  if(team)await request.delete(`/api/admin/teams/${teamId}`,{headers:{...headers,'If-Match':String(team.revision)}});
  await player.dispose();
 }
});
