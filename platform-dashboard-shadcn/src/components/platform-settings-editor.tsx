import { useMemo, useState } from "react"
import { Activity, LoaderCircle, ShieldCheck } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { PlatformSettingsReadModel } from "@/lib/platform-contracts"

type Settings = PlatformSettingsReadModel["settings"]

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value })
    return true
  } catch {
    return false
  }
}

function formatSettingValue(key: keyof Settings, value: Settings[keyof Settings]) {
  if (key === "mobileApprovedHosts") return (value as string[]).join(", ") || "None configured"
  if (key === "maxImageUploadKb") return `${Number(value).toLocaleString()} KB`
  return String(value)
}

export function PlatformSettingsEditor({
  settings,
  controls,
  editable,
  onSave,
  onRefresh,
}: {
  settings: Settings
  controls: PlatformSettingsReadModel["controls"]
  editable: boolean
  onSave: (settings: Settings, reason: string, expectedSettings: Settings) => Promise<void>
  onRefresh: () => void
}) {
  const [editState, setEditState] = useState({ base: settings, draft: settings })
  const [reason, setReason] = useState("")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const draft = JSON.stringify(editState.base) === JSON.stringify(settings) ? editState.draft : settings
  const changedFields = useMemo(() => (Object.keys(settings) as Array<keyof Settings>).filter((key) => JSON.stringify(settings[key]) !== JSON.stringify(draft[key])), [settings, draft])
  const hostsText = draft.mobileApprovedHosts.join("\n")
  const hostLines = hostsText.split(/\r?\n/).map((host) => host.trim()).filter(Boolean)
  const invalidHosts = hostLines.length > 20 || hostLines.some((host) => !/^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))*$/.test(host))
  const invalidEmail = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.enterpriseInquiryEmail.trim())
  const invalidTimezone = !isValidTimeZone(draft.defaultTimezone.trim())
  const invalidUploadLimit = !Number.isInteger(draft.maxImageUploadKb) || draft.maxImageUploadKb < 1 || draft.maxImageUploadKb > 8192
  const invalidDraft = invalidEmail || invalidTimezone || invalidUploadLimit || invalidHosts

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => setEditState({ base: settings, draft: { ...draft, [key]: value } })
  const reset = () => {
    setEditState({ base: settings, draft: settings })
    setReason("")
    setError(null)
    setNotice(null)
  }

  const save = async () => {
    if (!editable || !changedFields.length || invalidDraft || reason.trim().length < 8 || reason.trim().length > 500) return
    setBusy(true)
    setError(null)
    try {
      await onSave({ ...draft, enterpriseInquiryEmail: draft.enterpriseInquiryEmail.trim(), defaultTimezone: draft.defaultTimezone.trim(), mobileApprovedHosts: hostLines }, reason.trim(), settings)
      setConfirmOpen(false)
      setReason("")
      setNotice("Platform settings were saved and recorded in the security audit log.")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Platform settings could not be saved.")
    } finally {
      setBusy(false)
    }
  }

  return <div className="grid gap-5">
    <div className="grid gap-1"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Trust</p><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Settings</h1><p className="mt-1 max-w-2xl text-muted-foreground">Platform-wide defaults and control boundaries used by web, mobile, and sandbox surfaces.</p></div><Button variant="outline" className="min-h-11 w-fit gap-2" onClick={onRefresh}>Refresh settings <Activity data-icon="inline-start" /></Button></div></div>
    {notice ? <Alert><ShieldCheck /><AlertTitle>Settings saved</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}
    {error ? <Alert variant="destructive"><AlertTitle>Settings were not saved</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {!editable ? <Alert><ShieldCheck /><AlertTitle>Read-only preview</AlertTitle><AlertDescription>Sign in to the live Platform dashboard with settings-management permission to change these values.</AlertDescription></Alert> : null}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,.9fr)]">
      <section className="grid gap-0 border-y" aria-label="Platform defaults">
        <div className="flex flex-col justify-between gap-3 border-b py-4 sm:flex-row sm:items-center"><div><h2 className="text-lg font-semibold">Platform defaults</h2><p className="text-sm text-muted-foreground">Changes affect platform-wide behavior after they are saved.</p></div><div className="flex gap-2"><Button variant="outline" className="min-h-11" onClick={reset} disabled={!changedFields.length || busy}>Discard</Button><Button className="min-h-11" onClick={() => { setError(null); setConfirmOpen(true) }} disabled={!editable || !changedFields.length || invalidDraft || busy}>Review changes</Button></div></div>
        <FieldGroup className="gap-5 py-5">
          <Field data-invalid={invalidEmail || undefined}>
            <FieldLabel htmlFor="platform-inquiry-email">Enterprise inquiry email</FieldLabel>
            <Input id="platform-inquiry-email" className="min-h-11" type="email" value={draft.enterpriseInquiryEmail} disabled={!editable || busy} aria-invalid={invalidEmail} onChange={(event) => update("enterpriseInquiryEmail", event.target.value)} />
            <FieldDescription>Address shown to organizations contacting GetPrio about enterprise plans.</FieldDescription>
          </Field>
          <Field data-invalid={invalidTimezone || undefined}>
            <FieldLabel htmlFor="platform-default-timezone">Default timezone</FieldLabel>
            <Input id="platform-default-timezone" className="min-h-11" value={draft.defaultTimezone} disabled={!editable || busy} aria-invalid={invalidTimezone} placeholder="Asia/Manila" onChange={(event) => update("defaultTimezone", event.target.value)} />
            <FieldDescription>Use an IANA timezone, for example Asia/Manila or UTC.</FieldDescription>
          </Field>
          <Field data-invalid={invalidUploadLimit || undefined}>
            <FieldLabel htmlFor="platform-max-image-upload">Maximum image upload (KB)</FieldLabel>
            <Input id="platform-max-image-upload" className="min-h-11" type="number" min={1} max={8192} step={1} value={draft.maxImageUploadKb} disabled={!editable || busy} aria-invalid={invalidUploadLimit} onChange={(event) => update("maxImageUploadKb", Number(event.target.value))} />
            <FieldDescription>Whole-number limit between 1 KB and 8,192 KB.</FieldDescription>
          </Field>
          <Field data-invalid={invalidHosts || undefined}>
            <FieldLabel htmlFor="platform-mobile-hosts">Mobile approved hosts</FieldLabel>
            <Textarea id="platform-mobile-hosts" className="min-h-24" rows={4} value={hostsText} disabled={!editable || busy} aria-invalid={invalidHosts} placeholder="getprio.online" onChange={(event) => update("mobileApprovedHosts", event.target.value.split(/\r?\n/).map((host) => host.trim()).filter(Boolean))} />
            <FieldDescription>One hostname per line; enter hostnames only, with no scheme, port, path, or wildcard. Maximum 20.</FieldDescription>
          </Field>
        </FieldGroup>
      </section>
      <section className="grid gap-0 border-y"><div className="border-b py-4"><h2 className="text-lg font-semibold">Control posture</h2><p className="text-sm text-muted-foreground">What the Platform currently knows and permits.</p></div><div className="grid gap-0">{controls.map((control) => <div className="flex items-start justify-between gap-4 border-b py-4 last:border-b-0" key={control.label}><div className="grid gap-1"><span className="text-sm font-medium">{control.label}</span><span className="text-xs text-muted-foreground">{control.detail}</span></div><span className="text-xs capitalize text-muted-foreground">{control.state}</span></div>)}</div></section>
    </div>
    <Alert><ShieldCheck /><AlertTitle>Settings are privileged</AlertTitle><AlertDescription>Every change requires an audit reason and is recorded with the previous and resulting values. Server-side validation remains authoritative.</AlertDescription></Alert>
    <Dialog open={confirmOpen} onOpenChange={(open) => { if (!busy) setConfirmOpen(open) }}>
      <DialogContent className="overflow-hidden">
        <DialogHeader><DialogTitle>Review platform settings</DialogTitle><DialogDescription>Confirm the global defaults to update. This change will be recorded in the security audit log.</DialogDescription></DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-0.5">
          <div className="grid gap-2 rounded-md border p-3 text-sm">{changedFields.map((key) => <div className="grid gap-1 sm:grid-cols-[minmax(0,.7fr)_minmax(0,1.3fr)]" key={key}><span className="text-muted-foreground">{{ enterpriseInquiryEmail: "Enterprise inquiry email", defaultTimezone: "Default timezone", mobileApprovedHosts: "Mobile approved hosts", maxImageUploadKb: "Maximum image upload" }[key]}</span><span className="break-words font-medium">{formatSettingValue(key, draft[key])}</span></div>)}</div>
          <Field>
            <FieldLabel htmlFor="platform-settings-reason">Audit reason</FieldLabel>
            <Textarea id="platform-settings-reason" className="min-h-24" value={reason} maxLength={500} disabled={busy} placeholder="Why are these platform-wide defaults changing?" onChange={(event) => setReason(event.target.value)} />
            <FieldDescription>Required, 8–500 characters. This explanation is retained in the security audit record.</FieldDescription>
          </Field>
          {reason.trim().length > 0 && reason.trim().length < 8 ? <p className="text-sm text-destructive">Enter at least 8 characters.</p> : null}
        </div>
        <DialogFooter><Button className="min-h-11" variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy}>Cancel</Button><Button className="min-h-11" onClick={() => void save()} disabled={busy || invalidDraft || reason.trim().length < 8 || reason.trim().length > 500}>{busy ? <><LoaderCircle className="animate-spin" data-icon="inline-start" />Saving…</> : "Save settings"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}
