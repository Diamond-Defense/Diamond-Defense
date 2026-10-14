import {expect} from '@playwright/test';
export async function openLibraryPlay(page,type,id,title,action='edit'){
 const library=page.getByRole('dialog');
 if(!await library.isVisible())await page.getByRole('button',{name:'Back to Library',exact:true}).click();
 await expect(library).toBeVisible();await library.getByLabel('Search plays').fill(title);await library.getByLabel('Content type').selectOption(type);
 const card=library.locator(`article[data-content-id="${id}"]`);
 await card.getByRole('button',{name:action==='edit'?'Edit':`Present ${title}`,exact:true}).click();
 await expect(library).toHaveCount(0);
}

export async function boardAction(page,name){
 const button=page.getByRole('button',{name,exact:true});
 if(!await button.isVisible())await page.getByLabel('More actions',{exact:true}).click();
 await button.click();
}
