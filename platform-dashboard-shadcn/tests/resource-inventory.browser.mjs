// Run through the supported CUA browser surface against the local fixture only.
const root='http://127.0.0.1:5193/tests/fixtures/resource-inventory.html';
const check=(condition,message)=>{if(!condition)throw Error(message);};
export async function prepareReport(tab,params='') {
  await tab.goto(`${root}${params?`?${params}`:''}`);
  await tab.playwright.domSnapshot();
  await tab.playwright.getByRole('button',{name:'Find locations',exact:true}).click();
  await tab.playwright.getByRole('combobox',{name:'Location',exact:true}).click();
  await tab.playwright.getByRole('option',{name:'Test vendor · Main location (1/10)',exact:true}).click();
  await tab.playwright.domSnapshot();
}
export async function verifyLateReport(tab,params) {
  await prepareReport(tab,params);
  await tab.playwright.getByRole('button',{name:'Load resource report',exact:true}).click();
  await tab.playwright.getByRole('combobox',{name:'Location',exact:true}).click();
  await tab.playwright.getByRole('option',{name:'Other vendor · Other location (2/20)',exact:true}).click();
  await tab.playwright.getByRole('button',{name:'Load resource report',exact:true}).click();
  await tab.playwright.getByText('Completed calls: 2,1',{exact:true}).waitFor({state:'visible'});
  check(await tab.playwright.getByRole('heading',{name:'Other vendor · Other location',exact:true}).isVisible(),'New scope result must remain displayed');
  check((await tab.playwright.getByRole('region',{name:'Resource report results'}).innerText()).includes('2 / 20'),'Report must match new scope');
  check(await tab.playwright.getByText('Old request failed',{exact:true}).count()===0,'Old failure must not overwrite new report');
  await tab.playwright.getByRole('textbox',{name:'Window from (UTC)',exact:true}).fill('2026-10-12T00:00:00Z');
  check(await tab.playwright.getByRole('region',{name:'Resource report results'}).count()===0,'Window change must clear report');
}
export async function verifyAccessFailure(tab,params) {
  await prepareReport(tab,params);
  await tab.playwright.getByRole('button',{name:'Load resource report',exact:true}).click();
  await tab.playwright.getByText('Resource evidence access denied',{exact:true}).waitFor({state:'visible'});
  check(await tab.playwright.getByRole('button',{name:'Load resource report',exact:true}).count()===0,'Revocation must remove controls');
  check(await tab.playwright.getByRole('region',{name:'Resource report results'}).count()===0,'Revocation must clear private report');
  if(params==='expire')check(await tab.playwright.getByText('Session expiry callback invoked',{exact:true}).isVisible(),'401 must notify parent');
}
export async function verifyPrivateResultLifecycle(tab) {
  await prepareReport(tab);
  await tab.playwright.getByRole('button',{name:'Load resource report',exact:true}).click();
  await tab.playwright.getByRole('region',{name:'Resource report results'}).waitFor({state:'visible'});
  await tab.playwright.getByText('Work and captured plans · 26 records',{exact:true}).click();
  await tab.playwright.getByRole('button',{name:'Next Work and captured plans',exact:true}).click();
  check(await tab.playwright.getByText('Page 2 of 2',{exact:true}).isVisible(),'Details must paginate');
  await tab.playwright.getByRole('textbox',{name:'Vendor or location search',exact:true}).fill('Other');
  check(await tab.playwright.getByRole('region',{name:'Resource report results'}).count()===0,'Search change must clear report');
  await tab.playwright.getByRole('button',{name:'Find locations',exact:true}).click();
  await tab.playwright.getByRole('combobox',{name:'Location',exact:true}).click();
  await tab.playwright.getByRole('option',{name:'Test vendor · Main location (1/10)',exact:true}).click();
  await tab.playwright.getByRole('button',{name:'Load resource report',exact:true}).click();
  await tab.playwright.getByRole('region',{name:'Resource report results'}).waitFor({state:'visible'});
  await tab.playwright.getByRole('button',{name:'Revoke fixture access',exact:true}).click();
  check(await tab.playwright.getByRole('region',{name:'Resource report results'}).count()===0,'Prop revocation must clear report');
}
export async function verifyEditDuringReport(tab,field) {
  await prepareReport(tab,'race');
  await tab.playwright.getByRole('button',{name:'Load resource report',exact:true}).click();
  await tab.playwright.getByRole('textbox',{name:field,exact:true}).fill(field==='Vendor or location search'?'Other':'2026-10-12T00:00:00Z');
  await tab.playwright.getByText('Completed calls: 1',{exact:true}).waitFor({state:'visible'});
  check(await tab.playwright.getByRole('region',{name:'Resource report results'}).count()===0,'Editing during request must suppress old response');
}
