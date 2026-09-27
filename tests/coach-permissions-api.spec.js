import { test, expect, request as requests } from '@playwright/test';

test('director access is team-scoped and publishing is independently revocable', async ({request,baseURL}) => {
 const headers={Origin:new URL(baseURL).origin};
 const coach=await requests.newContext({baseURL});
 const prefix=`director-${Date.now()}`;const coachId=`${prefix}-coach`;const playerId=`${prefix}-player`;const teams=[];let publishedKey;let approvedKey;
 try {
  expect((await request.post('/api/auth/login',{headers,data:{role:'admin',password:'password'}})).ok()).toBeTruthy();
  for(let i=0;i<3;i++){
   const response=await request.post('/api/admin/teams',{headers,data:{id:`${prefix}-${i}`,name:`Director fixture ${prefix} ${i}`}});
   expect(response.status()).toBe(201);teams.push((await response.json()).record);
  }
  expect((await request.post(`/api/admin/teams/${teams[0].id}/members`,{headers,data:{userId:coachId,name:'Director fixture',role:'coach',password:'Initial-1234'}})).status()).toBe(201);
  expect((await coach.post('/api/auth/login',{headers,data:{role:'coach',teamId:teams[0].id,coachId,password:'Initial-1234'}})).ok()).toBeTruthy();
  expect((await coach.put('/api/auth/password',{headers,data:{currentPassword:'Initial-1234',newPassword:'Changed-1234'}})).ok()).toBeTruthy();
  expect((await request.post(`/api/admin/teams/${teams[1].id}/members`,{headers,data:{userId:playerId,name:'Director player',number:'8',role:'player',password:'Initial-1234'}})).status()).toBe(201);
  const permissionUrl=`/api/admin/users/${coachId}/permissions`;
  const grant=body=>request.put(permissionUrl,{headers,data:body});
  expect((await coach.put(permissionUrl,{headers,data:{teamIds:[teams[1].id],canPublishSituations:true}})).status()).toBe(403);
  expect((await coach.get(`/api/teams/${teams[1].id}/playbook`)).status()).toBe(403);
  expect((await grant({teamIds:[teams[1].id],canPublishSituations:false})).ok()).toBeTruthy();
  expect((await coach.get(`/api/teams/${teams[1].id}/playbook`)).status()).toBe(200);
  expect((await coach.get(`/api/reports/team/${teams[1].id}`)).status()).toBe(200);
  expect((await coach.get(`/api/practice/assignments?teamId=${teams[1].id}`)).status()).toBe(200);
  expect((await coach.get(`/api/practice/assignments?teamId=${teams[2].id}`)).status()).toBe(403);
  expect((await coach.post(`/api/admin/teams/${teams[1].id}/members`,{headers,data:{name:'Forbidden',role:'player',password:'Initial-1234'}})).status()).toBe(403);
  const state=await (await coach.get(`/api/teams/${teams[1].id}/playbook`)).json();
  const template=(await (await request.get('/api/situations')).json())[0];
  expect((await coach.put(`/api/teams/${teams[1].id}/playbook`,{headers,data:{keys:[template.key],revision:state.revision}})).ok()).toBeTruthy();
  const assignment=await coach.post('/api/practice/assignments',{headers,data:{teamId:teams[1].id,title:'Director draft',playerIds:[playerId],situations:[{situationKey:template.key}],publish:false}});
  expect(assignment.status()).toBe(201);
  expect((await assignment.json()).assignment.teamId).toBe(teams[1].id);
  const situation={...template,key:`${prefix}-situation`,title:`Director publication ${prefix}`};
  expect((await coach.post('/api/situations',{headers,data:situation})).status()).toBe(403);
  const submission=await coach.post('/api/situation-submissions',{headers,data:{situation:{...situation,key:`${prefix}-proposal`,title:`Director proposal ${prefix}`},rationale:'Permission coverage'}});
  expect(submission.status()).toBe(201);const proposal=(await submission.json()).record;
  expect((await coach.put(`/api/admin/situation-submissions/${proposal.id}`,{headers,data:{decision:'approve'}})).status()).toBe(403);
  expect((await grant({teamIds:[teams[1].id],canPublishSituations:true})).ok()).toBeTruthy();
  for(const decision of ['approve','reject']){
   expect((await coach.put(`/api/admin/situation-submissions/${proposal.id}`,{headers,data:{decision,notes:'Not authorized'}})).status()).toBe(403);
  }
  const approved=await request.put(`/api/admin/situation-submissions/${proposal.id}`,{headers,data:{decision:'approve',notes:'Reviewed permission fixture'}});
  expect(approved.ok()).toBeTruthy();approvedKey=proposal.situationKey;
  const publication=await coach.post('/api/situations',{headers,data:situation});expect(publication.status()).toBe(201);publishedKey=situation.key;
  expect((await coach.get(`/api/admin/situations/${publishedKey}/permanent`)).status()).toBe(403);
  const revision=(await publication.json()).record.revision;
  expect((await coach.put(`/api/situations/${publishedKey}`,{headers:{...headers,'If-Match':String(revision)},data:{...situation,desc:'Published update'}})).ok()).toBeTruthy();
  expect((await grant({teamIds:[],canPublishSituations:false})).ok()).toBeTruthy();
  expect((await coach.get(`/api/teams/${teams[1].id}/playbook`)).status()).toBe(403);
  expect((await coach.put(`/api/situations/${publishedKey}`,{headers:{...headers,'If-Match':String(revision+1)},data:situation})).status()).toBe(403);
 } finally {
  for(const key of [publishedKey,approvedKey].filter(Boolean)){const preview=await request.get(`/api/admin/situations/${key}/permanent`);if(preview.ok()){const item=await preview.json();await request.delete(`/api/admin/situations/${key}/permanent`,{headers:{...headers,'If-Match':String(item.revision)},data:{confirmation:item.title}});}}
  await request.put(`/api/admin/users/${coachId}/permissions`,{headers,data:{teamIds:[],canPublishSituations:false}});
  for(const team of teams)await request.delete(`/api/admin/teams/${team.id}`,{headers:{...headers,'If-Match':String(team.revision)}});
  await coach.dispose();
 }
});
