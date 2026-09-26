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
