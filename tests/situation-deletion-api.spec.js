import {test,expect} from '@playwright/test';
test('permanent deletion requires confirmation and frees the situation key for reimport',async({request,baseURL})=>{
 const headers={Origin:new URL(baseURL).origin};
 expect((await request.post('/api/auth/login',{headers,data:{role:'admin',password:'password'}})).ok()).toBeTruthy();
 const template=(await (await request.get('/api/situations')).json())[0];
 const key=`delete-test-${Date.now()}`;
 const situation={...template,key,title:key};
 const created=await request.post('/api/situations',{headers,data:situation});expect(created.status()).toBe(201);
 const endpoint=`/api/admin/situations/${key}/permanent`;
 const preview=await (await request.get(endpoint)).json();
 expect(preview.counts.assignments).toBe(0);
 expect((await request.delete(endpoint,{headers:{...headers,'If-Match':String(preview.revision)},data:{confirmation:'wrong'}})).status()).toBe(400);
 expect((await request.delete(endpoint,{headers:{...headers,'If-Match':String(preview.revision+1)},data:{confirmation:key}})).status()).toBe(409);
 expect((await request.delete(endpoint,{headers:{...headers,'If-Match':String(preview.revision)},data:{confirmation:key}})).ok()).toBeTruthy();
 expect((await request.get(endpoint)).status()).toBe(404);
 const replacement=await request.post('/api/situations',{headers,data:situation});expect(replacement.status()).toBe(201);
 const revision=(await replacement.json()).record.revision;
 expect((await request.delete(endpoint,{headers:{...headers,'If-Match':String(revision)},data:{confirmation:key}})).ok()).toBeTruthy();
});

test('inactive assignments allow situation cleanup and admin bulk deletion', async ({ request, baseURL }) => {
 const headers = { Origin: new URL(baseURL).origin };
 expect((await request.post('/api/admin/assignments/delete', { headers, data: { ids: ['missing'], confirmation: 'DELETE' } })).status()).toBe(401);
 await request.post('/api/auth/login', { headers, data: { role: 'admin', password: 'password' } });
 const template = (await (await request.get('/api/situations')).json())[0];
 const key = `inactive-delete-${Date.now()}`;
 const created = await request.post('/api/situations', { headers, data: { ...template, key, title: key } });
 expect(created.status()).toBe(201);
 const revision = (await created.json()).record.revision;
 const ids = [];
 try {
  for (let i = 0; i < 2; i++) {
   const response = await request.post('/api/practice/assignments', { headers, data: {
    teamId: '13u-black', title: `${key}-${i}`, playerIds: ['13u-black-bob-smith-11'], situations: [{ situationKey: key }], publish: true,
   } });
   expect(response.status()).toBe(201); ids.push((await response.json()).assignment.id);
  }
  const endpoint = `/api/admin/situations/${key}/permanent`;
  const deletion = () => request.delete(endpoint, { headers: { ...headers, 'If-Match': String(revision) }, data: { confirmation: key } });
  expect((await deletion()).status()).toBe(409);
  const blockedPreview = await (await request.get(endpoint)).json();
  expect(blockedPreview.blockingAssignments).toHaveLength(2);
  expect(blockedPreview.blockingAssignments).toEqual(expect.arrayContaining(ids.map(id => expect.objectContaining({ id, status: 'active', closedAt: null }))));
  expect(blockedPreview.blockingAssignments.every(item => item.title && item.teamName)).toBeTruthy();
  expect((await request.patch(`/api/practice/assignments/${ids[0]}`, { headers, data: { action: 'cancel' } })).ok()).toBeTruthy();
  expect((await request.post('/api/admin/assignments/delete', { headers, data: { ids, confirmation: 'DELETE' } })).status()).toBe(409);
  expect((await request.get(`/api/practice/assignments/${ids[0]}`)).status()).toBe(200);
  expect((await request.patch(`/api/practice/assignments/${ids[1]}`, { headers, data: { action: 'archive' } })).ok()).toBeTruthy();
  const preview = await (await request.get(endpoint)).json();
  expect(preview.counts.inactiveAssignments).toBe(2); expect(preview.counts.blockingAssignments).toBe(0);
  expect((await deletion()).ok()).toBeTruthy();
  expect((await request.post('/api/admin/assignments/delete', { headers, data: { ids, confirmation: 'wrong' } })).status()).toBe(400);
  const removed = await request.post('/api/admin/assignments/delete', { headers, data: { ids, confirmation: 'DELETE' } });
  expect(removed.ok()).toBeTruthy(); expect((await removed.json()).deleted).toBe(2);
  for (const id of ids) expect((await request.get(`/api/practice/assignments/${id}`)).status()).toBe(404);
 } finally {
  for (const id of ids) {
   await request.patch(`/api/practice/assignments/${id}`, { headers, data: { action: 'archive' } });
   await request.post('/api/admin/assignments/delete', { headers, data: { ids: [id], confirmation: 'DELETE' } });
  }
  await request.delete(`/api/admin/situations/${key}/permanent`, { headers: { ...headers, 'If-Match': String(revision) }, data: { confirmation: key } });
 }
});
