export default async function verify(page) {
  const origin = 'http://127.0.0.1:5196'
  let viewerAvailable = true
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
      else body = {data:{user:{id:'1',displayName:'Test admin',role:'Platform Admin'},capabilities:['platform.tenants.read','platform.settings.manage'],navigation:['operations','settings'],sessionExpiresAt:''}}
    }
    else if (path.endsWith('/platform/maintenance')) body = policy
    else if (path.endsWith('/platform/maintenance/preview')) body = {policy:request.postDataJSON().policy,revision:policy.revision,confirmation:{token:'test-preview',expiresAt:new Date(Date.now()+300000).toISOString()}}
    else if (path.endsWith('/platform/maintenance/policy')) {policy={...policy,...request.postDataJSON().policy,revision:'2'};saved=true;body=policy}
    else {status=503;body={message:'Unrelated read model unavailable'}}
    await route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(body)})
  })
  await page.setViewportSize({width:1280,height:900})
  await page.goto(`${origin}/service-health`)
  const pause = page.getByRole('checkbox',{name:'Pause new bookings and queue joins'})
  await pause.waitFor()
  await page.getByText('Service health data unavailable',{exact:true}).waitFor()
  if (await pause.isDisabled()) throw new Error('Authorized emergency control must remain editable during unrelated outages')
  await pause.check()
  await page.getByLabel('Audit reason').fill('Pause intake during a partial read model outage')
  await page.getByRole('button',{name:'Review maintenance change'}).click()
  await page.getByRole('button',{name:'Confirm maintenance change'}).click()
  await page.getByText('Maintenance settings saved',{exact:true}).waitFor()
  if (!saved || !policy.enabled) throw new Error('Maintenance save must work despite read model failures')
  viewerAvailable=false
  await page.reload()
  await page.getByText('Waiting for Platform authorization…',{exact:true}).waitFor()
  if (await pause.count()) throw new Error('No fixture authority may mount a live control before viewer authorization')
}
