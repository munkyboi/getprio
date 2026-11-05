import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { buildSync } from 'esbuild'
import type { ResourceInventoryApi } from '../src/lib/resource-inventory-contracts.ts'
const require = createRequire(import.meta.url)
const compiled = buildSync({ entryPoints:[fileURLToPath(new URL('../src/lib/platform-api.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',tsconfig:fileURLToPath(new URL('../tsconfig.app.json',import.meta.url)),define:{'import.meta.env':JSON.stringify({DEV:true})} }).outputFiles[0].text
test('private resource API uses CSRF/session protected bodies and puts no selectors in URLs',async()=>{
  const calls:Array<{url:string;options:RequestInit}>=[]
  const module={exports:{} as {resourceInventoryApi:ResourceInventoryApi}}
  runInNewContext(compiled,{module,exports:module.exports,require,window:{location:{hostname:'localhost'},sessionStorage:{getItem:()=>null}},document:{cookie:'prio_csrf=test-csrf'},crypto:{randomUUID:()=> 'test-request-id'},URL,URLSearchParams,console,fetch:async(url:string,options:RequestInit)=>{calls.push({url,options});return {ok:true,json:async()=>({scopes:[],limited:false})}}})
  await module.exports.resourceInventoryApi.searchScopes('Private branch')
  const input={tenantId:'1',locationId:'10',windowFrom:'2026-10-12T00:00:00Z',windowTo:'2026-10-12T01:00:00Z'}
  await module.exports.resourceInventoryApi.read(input)
  assert.deepEqual(calls.map(call=>new URL(call.url).pathname),['/api/platform/resource-inventory/scopes','/api/platform/resource-inventory/report'])
  assert.deepEqual(calls.map(call=>new URL(call.url).search),['',''])
  for(const {options} of calls) {assert.equal(options.method,'POST');assert.equal(options.credentials,'include');assert.equal(new Headers(options.headers).get('x-csrf-token'),'test-csrf')}
  assert.deepEqual(JSON.parse(String(calls[0].options.body)),{q:'Private branch'})
  assert.deepEqual(JSON.parse(String(calls[1].options.body)),input)
})
