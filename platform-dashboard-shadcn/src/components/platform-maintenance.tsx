import { useEffect, useState } from 'react'
import { LoaderCircle, ShieldCheck, Wrench } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { maintenanceApi } from '@/lib/platform-api'
import type { MaintenanceApi, MaintenancePolicy, MaintenancePreview, MaintenanceRecord } from '@/lib/maintenance-contracts'

const fixture: MaintenanceRecord = { revision: '1', enabled: false, forceScreen: false,
  message: 'GetPrio is undergoing maintenance. New bookings and queue joins are temporarily paused.', updatedAt: '' }
export function PlatformMaintenance({ live, editable, api = maintenanceApi }: { live: boolean; editable: boolean; api?: MaintenanceApi }) {
  const [current, setCurrent] = useState<MaintenanceRecord | null>(live ? null : fixture)
  const [draft, setDraft] = useState<MaintenancePolicy | null>(live ? null : fixture)
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState<MaintenancePreview | null>(null)
  const [operationKey, setOperationKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    if (!live) return
    let disposed = false
    api.read().then(policy => { if (!disposed) { setCurrent(policy); setDraft(policy) } }).catch(e => { if (!disposed) setError(e instanceof Error ? e.message : 'Maintenance controls are unavailable.') })
    return () => { disposed = true }
  }, [live, api])
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(null); setNotice(null)
    try { await action() } catch (e) { setError(e instanceof Error ? e.message : 'The maintenance change could not be completed.') }
    finally { setBusy(false) }
  }
  const refresh = () => run(async () => { const policy = await api.read(); setCurrent(policy); setDraft(policy); setPreview(null) })
  const review = () => run(async () => {
    if (!draft) return
    setPreview(await api.preview(draft, reason.trim())); setOperationKey(crypto.randomUUID())
  })
  const save = () => run(async () => {
    if (!preview) return
    try {
      const policy = await api.save(preview, reason.trim(), operationKey)
      setCurrent(policy); setDraft(policy); setPreview(null); setReason('')
      setNotice(policy.enabled ? 'Maintenance enabled. New intake is paused; existing work and staff/admin access remain available.' : 'Maintenance ended. New intake is available subject to normal queue and booking rules.')
    } catch (e) {
      // Keep the same operation key for uncertain/network retries. A confirmed
      // denial/stale preview requires a fresh review, not another confirmation.
      if (e instanceof Error && 'status' in e && [400, 401, 403, 409].includes(Number(e.status))) setPreview(null)
      throw e
    }
  })
  const changed = Boolean(draft && current && (draft.enabled !== current.enabled || draft.forceScreen !== current.forceScreen || draft.message !== current.message))
  const invalid = !draft?.message.trim() || draft.message.trim().length > 500 || reason.trim().length < 8 || reason.trim().length > 500
  const frozen = busy || Boolean(preview) || !editable
  return <Card>
    <CardHeader><CardTitle>Safe maintenance mode</CardTitle><CardDescription>Pause new bookings and queue joins without shutting down work already in progress.</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-4">
      <div><Badge variant={current?.enabled ? 'warning' : 'secondary'}>{current ? current.enabled ? 'Maintenance active' : live ? 'Intake available' : 'Read-only fixture' : 'Loading controls'}</Badge></div>
      {error ? <Alert variant="destructive"><AlertTitle>Maintenance controls need attention</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {notice ? <Alert><ShieldCheck /><AlertTitle>Maintenance settings saved</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}
      <Alert><ShieldCheck /><AlertTitle>Existing work stays available</AlertTitle><AlertDescription>Staff can finish tickets, check in existing confirmed bookings, and process existing payments. Platform Admin access stays available. Ending maintenance does not reopen queues or override vendor restrictions.</AlertDescription></Alert>
      {draft ? <FieldGroup>
        <Field orientation="horizontal" data-disabled={frozen || undefined}><Checkbox id="maintenance-enabled" checked={draft.enabled} disabled={frozen} onCheckedChange={enabled => setDraft({ ...draft, enabled: enabled === true, forceScreen: enabled === true && draft.forceScreen })} /><FieldLabel htmlFor="maintenance-enabled">Pause new bookings and queue joins</FieldLabel></Field>
        <Field orientation="horizontal" data-disabled={frozen || !draft.enabled || undefined}><Checkbox id="maintenance-force-screen" checked={draft.forceScreen} disabled={frozen || !draft.enabled} onCheckedChange={checked => setDraft({ ...draft, forceScreen: checked === true })} /><FieldLabel htmlFor="maintenance-force-screen">Show full maintenance screen on public/customer pages</FieldLabel></Field>
        <FieldDescription>The frontpage and new-customer flows show the maintenance screen. Staff/admin tools, sign-in/security, existing booking details, ticket tracking, and payment returns remain accessible.</FieldDescription>
        <Field><FieldLabel htmlFor="maintenance-message">Public maintenance message</FieldLabel><Textarea id="maintenance-message" maxLength={500} value={draft.message} disabled={frozen} onChange={event => setDraft({ ...draft, message: event.target.value })} /><FieldDescription>Plain text only. Do not include internal errors, credentials, or operational details.</FieldDescription></Field>
        <Field><FieldLabel htmlFor="maintenance-reason">Audit reason</FieldLabel><Textarea id="maintenance-reason" maxLength={500} value={reason} disabled={frozen} onChange={event => setReason(event.target.value)} /><FieldDescription>Required, 8–500 characters. Visible only in the admin audit record.</FieldDescription></Field>
      </FieldGroup> : null}
    </CardContent>
    <CardFooter className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" disabled={!live || busy || Boolean(preview) || changed} onClick={() => void refresh()}>Refresh maintenance controls</Button><Button variant="outline" className="min-h-11" disabled={!changed || frozen} onClick={() => { setDraft(current); setReason(''); setError(null) }}>Discard changes</Button><Button className="min-h-11" disabled={!editable || !changed || invalid || busy || Boolean(preview)} onClick={() => void review()}>{busy ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Wrench data-icon="inline-start" />}Review maintenance change</Button></CardFooter>
    <Dialog open={Boolean(preview)} onOpenChange={open => { if (!open && !busy) setPreview(null) }}>
      <DialogContent><DialogHeader><DialogTitle>Confirm maintenance change</DialogTitle><DialogDescription>This changes intake across GetPrio. Existing work and staff/admin access are preserved.</DialogDescription></DialogHeader>
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto"><p>{preview?.policy.enabled ? 'Pause new bookings and queue joins.' : 'End maintenance and restore normal intake rules.'}</p><p>{preview?.policy.forceScreen ? 'Show the full maintenance screen on public/customer pages.' : 'Keep public/customer pages available with a maintenance notice when active.'}</p><p className="break-words">{preview?.policy.message}</p><p className="text-sm text-muted-foreground">Audit reason: {reason}</p>{error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}</div>
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setPreview(null)}>Cancel</Button><Button className="min-h-11" disabled={busy} onClick={() => void save()}>{busy ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}Confirm maintenance change</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </Card>
}
