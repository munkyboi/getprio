import { useEffect, useState } from "react";
import { Alert, Badge, Button, Group, Modal, NumberInput, Paper, Stack, Switch, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { apiRequest } from "../api";
import { ConfirmActionModal } from "./ConfirmActionModal";

type Category = { id: string; name: string; isActive: boolean; sortOrder: number; revision: number; vendorCount: number };
type Draft = { name: string; isActive: boolean; sortOrder: number };
export function BusinessCategoriesPanel({ token }: { token: string }) {
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", isActive: true, sortOrder: 10 });
  const [initial, setInitial] = useState(draft);
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  async function load(signal?: AbortSignal) {
    setLoading(true); setError("");
    try { const data = await apiRequest<{ items: Category[] }>("/platform/business-categories", { token, signal }); if (!signal?.aborted) setItems(data.items); }
    catch (failure) { if (!signal?.aborted) setError(failure instanceof Error ? failure.message : "Unable to load categories."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [token]);
  function edit(item: Category | null) {
    const value = item ? { name: item.name, isActive: item.isActive, sortOrder: item.sortOrder } : { name: "", isActive: true, sortOrder: Math.min(10000, Math.max(0, ...items.filter((row) => row.isActive).map((row) => row.sortOrder)) + 10) };
    setEditing(item); setDraft(value); setInitial(value); setSaveError(""); setOpened(true);
  }
  function close() { if (!busy) { if (JSON.stringify(draft) !== JSON.stringify(initial)) setDiscard(true); else setOpened(false); } }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setSaveError("");
    try {
      await apiRequest(`/platform/business-categories${editing ? `/${editing.id}` : ""}`, { token, method: editing ? "PATCH" : "POST", body: { ...draft, revision: editing?.revision } });
      setOpened(false); await load(); notifications.show({ color: "teal", title: "Business category saved", message: "Vendor selections now use the updated catalog." });
    } catch (failure) { setSaveError(failure instanceof Error ? failure.message : "Unable to save category."); }
    finally { setBusy(false); }
  }
  return <>
    <Paper className="portal-card business-categories" p="lg"><Stack>
      <Group justify="space-between"><div><Title order={3}>Business Categories</Title><Text c="dimmed">Maintain the list vendors choose from. Lower display orders appear first.</Text></div><Group><Button variant="subtle" disabled={loading || busy} onClick={() => void load()}>Refresh list</Button><Button onClick={() => edit(null)} disabled={loading || !!error}>Add category</Button></Group></Group>
      {error ? <Alert color="red">{error}<Button variant="subtle" onClick={() => void load()}>Retry</Button></Alert> : loading ? <Text role="status">Loading categories…</Text> : items.map((item) => <Paper key={item.id} withBorder p="md"><Group justify="space-between"><div><Text fw={600}>{item.name}</Text><Text size="sm" c="dimmed">Order {item.sortOrder} · {item.vendorCount} assigned vendors</Text></div><Group><Badge color={item.isActive ? "teal" : "gray"}>{item.isActive ? "Active" : "Inactive"}</Badge><Button variant="light" aria-label={`Edit ${item.name}`} onClick={() => edit(item)}>Edit</Button></Group></Group></Paper>)}
      <Text size="sm" c="dimmed">Inactive categories remain on existing profiles but cannot be newly selected. Rename a category to update all its assigned vendors. IDs stay unchanged.</Text>
    </Stack></Paper>
    <Modal opened={opened} onClose={close} closeOnEscape={!busy} closeOnClickOutside={!busy} closeButtonProps={{ "aria-label": "Close" }} centered size="lg" classNames={{ content: "task-modal", body: "task-modal__body" }} title={<div className="getprio-modal-title"><Text className="getprio-modal-eyebrow">BUSINESS CATEGORIES</Text><Title className="getprio-modal-heading" order={3}>{editing ? `Edit ${editing.name}` : "Add a business category"}</Title></div>}>
      <form className="task-modal-form business-categories" onSubmit={save}><Stack className="task-modal-form__main">
        <Text>Vendors select an active category when registering or editing their business profile.</Text>
        {saveError && <Alert color="red">{saveError}</Alert>}
        <TextInput disabled={busy} data-autofocus required label="Category name" maxLength={80} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })} />
        <NumberInput disabled={busy} label="Display order" description="Lower numbers appear first. Names break ties." min={0} max={10000} allowDecimal={false} value={draft.sortOrder} onChange={(value) => setDraft({ ...draft, sortOrder: Number(value) || 0 })} />
        <Switch disabled={busy} label="Available for new vendor selections" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.currentTarget.checked })} />
        {editing && <Text c="dimmed">{editing.vendorCount} vendors currently use this category. Deactivating it preserves their assignments.</Text>}
      </Stack><Group className="subscription-editor__footer" justify="space-between"><Text size="sm" c="dimmed">Changes are recorded in the security audit.</Text><Button type="submit" loading={busy} disabled={!draft.name.trim()}>Save category</Button></Group></form>
    </Modal>
    <ConfirmActionModal opened={discard} title="Discard category changes?" description="Your changes to this category have not been saved." confirmLabel="Discard changes" onClose={() => setDiscard(false)} onConfirm={() => { setDiscard(false); setOpened(false); }} />
  </>;
}
