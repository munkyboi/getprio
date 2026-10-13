export default async function verify(page) {
  const origin = 'http://127.0.0.1:5196'
  let viewerAvailable = true
  let editable = true
  let outage = true
  let maintenanceReads = 0
  let writes = 0
  let saved = false
  let policy = {revision:'1',enabled:false,forceScreen:false,message:'Temporary maintenance.',updatedAt:''}
  await page.route('http://127.0.0.1:5001/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    const headers = {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type,X-CSRF-Token,Idempotency-Key,X-Transaction-Confirmation','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}
    let status = 200, body = {}
    if (request.method() === 'OPTIONS') body = {}
    else if (path.endsWith('/auth/me')) body = {user:{id:'1',name:'Test admin',displayName:'Test admin',roles:['platform_admin'],mfaEnabled:true}}
    else if (path.endsWith('/platform/viewer-context')) {
      if (!viewerAvailable) {status=503;body={message:'Viewer unavailable'}}
      else body = {data:{user:{id:'1',displayName:'Test admin',role:'Platform Admin'},capabilities:['platform.tenants.read',...(editable ? ['platform.settings.manage'] : [])],navigation:['operations','settings'],sessionExpiresAt:''}}
    }
    else if (path.endsWith('/platform/maintenance')) {maintenanceReads++;body = policy}
    else if (path.endsWith('/platform/maintenance/preview')) body = {policy:request.postDataJSON().policy,revision:policy.revision,confirmation:{token:'test-preview',expiresAt:new Date(Date.now()+300000).toISOString()}}
    else if (path.endsWith('/platform/maintenance/policy')) {writes++;policy={...policy,...request.postDataJSON().policy,revision:'2'};saved=true;body=policy}
    else if (!outage) body = {data:path.endsWith('/platform/service-health') ? {services:[
      {id:'api',name:'Platform API',description:'Authenticated API',state:'healthy',observedAt:'Just now',freshness:'live',evidence:'Observed response',metric:'200 response'},
      {id:'push',name:'Mobile push',description:'Notification pipeline',state:'unknown',observedAt:'Not observed',freshness:'not-observed',evidence:'No heartbeat',metric:'Heartbeat required'}
    ]} : {}}
    else {status=503;body={message:'Unrelated read model unavailable'}}
    await route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(body)})
  })
  await page.setViewportSize({width:1280,height:900})
  await page.goto(`${origin}/service-health`)
  const pause = page.getByRole('checkbox',{name:'Pause new bookings and queue joins'})
  const observations = page.getByRole('tab',{name:'Observations',exact:true})
  const maintenance = page.getByRole('tab',{name:'Maintenance',exact:true})
  const checkResponsivePanel = async (surface, tab) => {
    for (const width of [375,768,1280]) {
      await page.setViewportSize({width,height:900})
      if (await page.locator('body').evaluate(el => el.scrollWidth > window.innerWidth)) throw new Error(`${surface} overflows at ${width}px`)
      if ((await tab.boundingBox()).height < 44) throw new Error('Tabs must keep touch-friendly targets')
      await page.screenshot({path:`service-health-${surface}-${width}.png`,fullPage:true})
    }
  }
  await observations.waitFor()
  await page.getByText('Service health data unavailable',{exact:true}).waitFor()
  if (await observations.getAttribute('aria-selected') !== 'true' || await pause.isVisible()) throw new Error('Observations must be the default, with maintenance controls hidden')
  await observations.focus(); await observations.press('ArrowRight'); await maintenance.press('Enter')
  await pause.waitFor()
  if (await pause.isDisabled()) throw new Error('Authorized emergency control must remain editable during unrelated outages')
  await pause.check()
  await page.getByLabel('Public maintenance message').fill('Scheduled maintenance; existing work can finish.')
  await page.getByLabel('Audit reason').fill('Pause intake during a partial read model outage')
  const readsBeforeSwitch = maintenanceReads
  await observations.click()
  await pause.waitFor({state:'hidden'})
  if (await pause.isVisible() || await page.getByLabel('Audit reason').isVisible()) throw new Error('Inactive maintenance fields must be hidden')
  await maintenance.click()
  await pause.waitFor()
  if (!await pause.isChecked() || await page.getByLabel('Audit reason').inputValue() !== 'Pause intake during a partial read model outage' || await page.getByLabel('Public maintenance message').inputValue() !== 'Scheduled maintenance; existing work can finish.') throw new Error('Switching tabs must preserve the maintenance draft')
  if (maintenanceReads !== readsBeforeSwitch || writes !== 0) throw new Error('Switching tabs must not reload or save maintenance settings')
  await checkResponsivePanel('maintenance', maintenance)
  await page.getByRole('button',{name:'Review maintenance change'}).click()
  await page.getByRole('button',{name:'Confirm maintenance change'}).click()
  await page.getByText('Maintenance settings saved',{exact:true}).waitFor()
  if (!saved || !policy.enabled) throw new Error('Maintenance save must work despite read model failures')
  outage=false
  await page.reload()
  const search = page.getByPlaceholder('Search services…')
  await search.waitFor()
  await search.fill('Platform API')
  await maintenance.click(); await pause.waitFor()
  await observations.click(); await search.waitFor()
  if (await search.inputValue() !== 'Platform API') throw new Error('Observation filters must survive tab switches')
  await search.fill('')
  await checkResponsivePanel('observations', observations)
  editable=false
  await page.reload(); await maintenance.click(); await pause.waitFor()
  if (!await pause.isDisabled() || !await page.getByRole('button',{name:'Review maintenance change'}).isDisabled()) throw new Error('Read-only viewers must remain unable to change maintenance')
  viewerAvailable=false
  await page.reload()
  await maintenance.click()
  await page.getByText('Waiting for Platform authorization…',{exact:true}).waitFor()
  if (await pause.count()) throw new Error('No fixture authority may mount a live control before viewer authorization')
}
