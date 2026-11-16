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

export async function selectStage(page,name){
  if(name==='Starting situation')return selectBoardStep(page,'Starting alignment');
  const stage=page.getByRole('navigation',{name:'Editor tools'}).getByRole('button',{name,exact:true});
  if(await stage.getAttribute('aria-current')!=='page')await stage.click();
}

export async function selectBoardStep(page, name) {
  await selectStage(page,'Play timeline');
  await page.getByRole('region',{name:'Play steps'}).getByRole('button',{name,exact:true}).click();
}

export async function addBoardStep(page, preset='Blank step') {
  await selectStage(page,'Play timeline');
  await page.getByRole('button',{name:'+ Add Step',exact:true}).click();
  await page.getByRole('group',{name:'Step presets',exact:true}).getByRole('button',{name:preset,exact:true}).click();
}

export async function openRunnerAdvances(page) {
  await openBattedBall(page,{outcomes:true});
}

export async function addBoardThrow(page, from, to) {
  await page.getByRole('button',{name:'Add throw',exact:true}).click();
  if(from) await page.getByRole('button',{name:`${from} token`,exact:true}).click();
  await page.getByRole('button',{name:`${to} token`,exact:true}).click();
}


export async function openBattedBall(page,{outcomes=false}={}){
  await selectStage(page,'Play timeline');
  const step=page.getByRole('region',{name:'Play steps'}).locator('[data-hit-step="true"]');
  if(await step.getAttribute('aria-current')!=='step')await step.click();
  const ball=page.getByRole('button',{name:'Edit batted ball action',exact:true});
  if(await ball.getAttribute('aria-expanded')!=='true')await ball.click();
  if(outcomes){
    const running=page.getByRole('button',{name:'Edit play outcomes',exact:true});
    if(await running.getAttribute('aria-expanded')!=='true')await running.click();
  }
}

export async function openDefense(page,cue='At contact'){
  const summary=page.getByRole('region',{name:cue,exact:true}).getByText(/^Defense · /);
  if(await summary.evaluate(el=>!el.parentElement.open))await summary.click();
}
