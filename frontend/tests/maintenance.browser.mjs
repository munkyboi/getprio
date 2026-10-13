export default async function verify(page) {
  let mode = { enabled: true, forceScreen: true, message: 'We are improving GetPrio. Please try again shortly.' }
  let identity = null
  await page.route('http://127.0.0.1:5001/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const body = path.endsWith('/public/maintenance') ? mode : path.endsWith('/auth/me') && identity ? {user:identity} : path.endsWith('/auth/oauth/providers') ? { providers: {} } : { message: 'Not signed in' }
    await route.fulfill({ status: path.endsWith('/auth/me') && !identity ? 401 : 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5195', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type' }, body: JSON.stringify(body) })
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://127.0.0.1:5195/')
  await page.getByRole('heading', { name: 'GetPrio is undergoing maintenance' }).waitFor()
  if (await page.locator('body').evaluate(el => el.scrollWidth > window.innerWidth)) throw new Error('Maintenance screen overflows mobile')
  await page.getByRole('link', { name: 'Staff / admin sign in' }).click()
  await page.getByText('GetPrio is undergoing maintenance', { exact: true }).waitFor({ state: 'hidden' })
  await page.goto('http://127.0.0.1:5195/')
  await page.getByRole('heading', { name: 'GetPrio is undergoing maintenance' }).waitFor()
  mode = { ...mode, enabled: false, forceScreen: false }
  await page.getByRole('button', { name: 'Check again' }).click()
  await page.getByRole('heading', { name: 'GetPrio is undergoing maintenance' }).waitFor({ state: 'hidden' })
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
  identity = {id:'1',name:'Test staff',roles:['staff'],email:'staff@example.test',username:'teststaff',displayName:'Test staff',emailVerified:true,hasPassword:true,oauthProviders:[],tenants:[{id:'1',slug:'test-vendor',name:'Test vendor',role:'staff',isActive:true}]}
  await page.goto('http://127.0.0.1:5195/dashboard/queue')
  await page.getByRole('banner').waitFor()
  if (await page.getByRole('heading', { name: 'GetPrio is undergoing maintenance' }).count()) throw new Error('Staff operations must remain accessible')
  identity = {...identity, roles:['platform_admin'],tenants:[]}
  await page.goto('http://127.0.0.1:5195/')
  await page.getByRole('banner').waitFor()
  if (await page.getByRole('heading', { name: 'GetPrio is undergoing maintenance' }).count()) throw new Error('Platform Admin must remain accessible')
}
