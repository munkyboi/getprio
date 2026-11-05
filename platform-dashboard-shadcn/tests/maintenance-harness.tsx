import { createRoot } from 'react-dom/client'
import { PlatformMaintenance } from '../src/components/platform-maintenance'
import type { MaintenanceApi, MaintenanceRecord } from '../src/lib/maintenance-contracts'
import '../src/index.css'
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local-only test harness')
let policy: MaintenanceRecord = { enabled: false, forceScreen: false, message: 'GetPrio is temporarily undergoing maintenance.', revision: '1', updatedAt: '' }
let failOnce = location.search.includes('failure')
let denyOnce = location.search.includes('denied')
const receipts = new Map<string, MaintenanceRecord>()
const api: MaintenanceApi = {
  read: async () => structuredClone(policy),
  operationStatus: async key => receipts.has(key) ? {state:'committed',policy:structuredClone(policy)} : {state:'unknown'},
  abandon: async key => ({ state: receipts.has(key) ? 'committed' : 'abandoned', policy: structuredClone(policy) }),
  preview: async (draft) => ({ policy: structuredClone(draft), revision: policy.revision, confirmation: { token: 'bound-test-token', expiresAt: new Date(Date.now() + 300_000).toISOString() } }),
  save: async (preview, reason, key) => {
    if (receipts.has(key)) return structuredClone(receipts.get(key)!)
    if (failOnce && location.search.includes('pending')) { failOnce=false; throw new Error('Simulated network failure') }
    if (denyOnce) { denyOnce=false; throw Object.assign(new Error('Simulated retry denial'),{status:403}) }
    if (!reason || !key || preview.confirmation.token !== 'bound-test-token') throw new Error('Missing confirmation')
    policy = { ...preview.policy, revision: String(Number(policy.revision) + 1), updatedAt: new Date().toISOString() }
    document.querySelector('#saved')!.textContent = JSON.stringify(policy)
    receipts.set(key, structuredClone(policy))
    if (failOnce) { failOnce = false; throw new Error('Simulated network failure') }
    return structuredClone(policy)
  },
}
createRoot(document.getElementById('root')!).render(<><PlatformMaintenance live editable={!location.search.includes('readonly')} api={api} /><output id="saved" className="block break-all" aria-label="Saved maintenance policy" /></>)
