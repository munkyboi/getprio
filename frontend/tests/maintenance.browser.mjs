export default async function verify(page) {
  await page.emulateMedia({reducedMotion:'reduce'})
  let mode = { enabled: true, forceScreen: true, message: 'We are improving GetPrio. Please try again shortly.' }
  let identity = null
  let hangStatus = false
  let malformedStatus = false
  await page.route('http://127.0.0.1:5001/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/public/maintenance') && hangStatus) { await new Promise(() => {}); return }
    if (path.endsWith('/public/maintenance') && malformedStatus) { await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'http://127.0.0.1:5195','Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type'},body:'{'}); return }
    const body = path.endsWith('/public/maintenance') ? mode : path.endsWith('/auth/me') && identity ? {user:identity} : path.endsWith('/auth/oauth/providers') ? { providers: {} } : { message: 'Not signed in' }
    const status = route.request().method() === 'OPTIONS' || path.endsWith('/public/maintenance') || path.endsWith('/auth/oauth/providers') || (path.endsWith('/auth/me') && identity) ? 200 : path.endsWith('/auth/me') ? 401 : 503
    await route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5195', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type' }, body: JSON.stringify(body) })
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://127.0.0.1:5195/')
  await page.getByRole('heading', { name: 'GetPrio is undergoing maintenance' }).waitFor()
  await page.screenshot({path:'maintenance-public-mobile.png',fullPage:true})
  malformedStatus = true
  await page.getByRole('button', {name:'Check again'}).click()
  await page.getByText('Could not check the latest status', {exact:true}).waitFor()
  if (!await page.getByRole('heading', {name:'GetPrio is undergoing maintenance'}).isVisible()) throw new Error('Malformed HTTP 200 must not clear known maintenance')
  malformedStatus = false
  await page.getByRole('button', {name:'Check again'}).click()
  await page.getByText('Could not check the latest status', {exact:true}).waitFor({state:'hidden'})
  if (await page.locator('body').evaluate(el => el.scrollWidth > window.innerWidth)) throw new Error('Maintenance screen overflows mobile')
  await page.getByRole('link', { name: 'Staff / admin sign in' }).click()
  await page.getByText('GetPrio is undergoing maintenance', { exact: true }).waitFor({ state: 'hidden' })
  await page.goto('http://127.0.0.1:5195/')
  await page.getByRole('heading', { name: 'GetPrio is undergoing maintenance' }).waitFor()
  hangStatus = true
  await page.getByRole('button', { name: 'Check again' }).click()
  await page.getByText('Could not check the latest status', { exact: true }).waitFor({timeout:22_000})
  if (!await page.getByRole('heading', { name: 'GetPrio is undergoing maintenance' }).isVisible()) throw new Error('A failed refresh must preserve known maintenance')
  hangStatus = false
  mode = { ...mode, enabled: false, forceScreen: false }
  await page.getByRole('heading', { name: 'GetPrio is undergoing maintenance' }).waitFor({ state: 'hidden', timeout:22_000 })
  await page.setViewportSize({ width: 1280, height: 900 })
  mode = { ...mode, enabled: true, forceScreen: false }
  await page.reload()
  await page.getByRole('alert').filter({ hasText: mode.message }).waitFor()
  if (await page.getByRole('heading', { name: 'GetPrio is undergoing maintenance' }).count()) throw new Error('Safe-only maintenance must not force the screen')
  mode = { ...mode, forceScreen: true }
  await page.reload()
  await page.getByRole('heading', { name: 'GetPrio is undergoing maintenance' }).waitFor()
  mode = { ...mode, enabled: false, forceScreen: false }
  await page.getByRole('heading', { name: 'GetPrio is undergoing maintenance' }).waitFor({ state: 'hidden', timeout: 22_000 })
  mode = { ...mode, enabled: true, forceScreen: true }
  await page.goto('http://127.0.0.1:5195/vendors/demo/book?booking_sms_payment=123')
  await page.getByRole('alert').filter({hasText:mode.message}).waitFor()
  if (await page.getByRole('heading', { name: 'GetPrio is undergoing maintenance' }).count()) throw new Error('Stored booking-payment return UI must stay reachable')
  identity = {id:'1',name:'Test staff',roles:['staff'],email:'staff@example.test',username:'teststaff',displayName:'Test staff',emailVerified:true,hasPassword:true,oauthProviders:[],tenants:[{id:'1',slug:'test-vendor',name:'Test vendor',role:'staff',isActive:true}]}
  await page.goto('http://127.0.0.1:5195/dashboard/queue')
  await page.getByRole('alert').filter({hasText:mode.message}).waitFor()
  if (await page.getByRole('heading', { name: 'GetPrio is undergoing maintenance' }).count()) throw new Error('Staff operations must remain accessible')
  identity = {...identity, roles:['platform_admin'],tenants:[]}
  await page.goto('http://127.0.0.1:5195/')
  await page.getByRole('alert').filter({hasText:mode.message}).waitFor()
  if (await page.getByRole('heading', { name: 'GetPrio is undergoing maintenance' }).count()) throw new Error('Platform Admin must remain accessible')
}
