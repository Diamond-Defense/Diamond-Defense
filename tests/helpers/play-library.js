import {expect} from '@playwright/test';
export async function openLibraryPlay(page,type,id,title,action='edit'){
 const library=page.getByRole('dialog');
 if(!await library.isVisible())await page.getByRole('button',{name:'Browse Library',exact:true}).click();
 await expect(library).toBeVisible();await library.getByLabel('Search plays').fill(title);await library.getByLabel('Content type').selectOption(type);
 const card=library.locator(`article[data-content-id="${id}"]`);
 await card.getByRole('button',{name:action==='edit'?'Edit':`Present ${title}`,exact:true}).click();
 await expect(library).toHaveCount(0);
}
