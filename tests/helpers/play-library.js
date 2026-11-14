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

export async function selectBoardStep(page, name) {
  await page.getByRole('region',{name:'Play steps'}).getByRole('button',{name,exact:true}).click();
}

export async function addBoardStep(page, preset='Blank step') {
  await page.getByRole('button',{name:'+ Add Step',exact:true}).click();
  await page.getByRole('group',{name:'Step presets',exact:true}).getByRole('button',{name:preset,exact:true}).click();
}

export async function openRunnerAdvances(page) {
  await selectBoardStep(page,'Contact');
  const ball=page.getByRole('button',{name:'Batted ball',exact:true});
  if(await ball.getAttribute('aria-expanded')==='false')await ball.click();
}

export async function addBoardThrow(page, from, to) {
  await page.getByRole('button',{name:'Add throw',exact:true}).click();
  if(from) await page.getByRole('button',{name:`${from} token`,exact:true}).click();
  await page.getByRole('button',{name:`${to} token`,exact:true}).click();
}
