import { useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Archive, ArrowLeft, BookOpenText, CircleHelp, FileText, History, LoaderCircle, Plus, RotateCcw, Save, Send, ShieldCheck } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { PlatformDataTable } from "@/components/platform-data-table"
import { PlatformMetricCard } from "@/components/platform-metric-card"
import { removeHelpCenterDraftItem } from "@/lib/help-center-draft"
import { platformApi } from "@/lib/platform-api"
import type { PlatformHelpCenterArticle, PlatformHelpCenterContent, PlatformHelpCenterFaq, PlatformHelpCenterTopic } from "@/lib/platform-contracts"
import { cn } from "cn"

type Kind = "topic" | "guide" | "faq"
type Selection = { kind: Kind; id: string }
type Page = "overview" | "topics" | "guides" | "faqs"
type ManagerProps = { page: Page; onNavigate: (page: Page) => void }
type HelpItem = PlatformHelpCenterTopic | PlatformHelpCenterArticle | PlatformHelpCenterFaq
type Revision = { revision: number; createdAt: string; createdBy: string | number | null; changeReason: string; publishedAt: string | null }

const pageCopy: Record<Page, { title: string; description: string; kind?: Kind }> = {
  overview: { title: "Help Center overview", description: "Review content health, find items that need attention, and manage the customer-facing Help Center." },
  topics: { title: "Topics", description: "Organize Help Center content into clear customer-facing subjects.", kind: "topic" },
  guides: { title: "Guides", description: "Manage step-by-step help articles and keep their review records current.", kind: "guide" },
  faqs: { title: "FAQs", description: "Manage quick answers and their optional related guides.", kind: "faq" },
}

const todayInManila = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function plusDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function initialReview() {
  return { owner: "GetPrio Support", timeZone: "Asia/Manila", cadenceDays: 90, appliesTo: ["web", "mobile"] as Array<"web" | "mobile">, lastReviewedAt: null, reviewDueAt: null, sourceReferences: [] as string[] }
}

function itemTitle(content: PlatformHelpCenterContent, selection: Selection) {
  if (selection.kind === "topic") return content.topics.find((item) => item.id === selection.id)?.title || selection.id
  if (selection.kind === "guide") return content.articles.find((item) => item.id === selection.id)?.title || selection.id
  return content.faqs.find((item) => item.id === selection.id)?.question || selection.id
}

function itemReviewed(item: PlatformHelpCenterArticle | PlatformHelpCenterFaq) {
  const review = item.review
  return Boolean(review.lastReviewedAt && review.reviewDueAt && review.sourceReferences.length && new Date(`${review.reviewDueAt}T23:59:59`) >= new Date())
}

function sectionForKind(kind: Kind): Page {
  return kind === "topic" ? "topics" : kind === "guide" ? "guides" : "faqs"
}

function selectionKind(page: Page): Kind | null {
  return page === "topics" ? "topic" : page === "guides" ? "guide" : page === "faqs" ? "faq" : null
}

function getHelpItem(content: PlatformHelpCenterContent, selection: Selection | null): HelpItem | null {
  if (!selection) return null
  if (selection.kind === "topic") return content.topics.find((item) => item.id === selection.id) || null
  if (selection.kind === "guide") return content.articles.find((item) => item.id === selection.id) || null
  return content.faqs.find((item) => item.id === selection.id) || null
}

function updateHelpItem(content: PlatformHelpCenterContent, selection: Selection, update: (item: HelpItem) => HelpItem): PlatformHelpCenterContent {
  if (selection.kind === "topic") return { ...content, topics: content.topics.map((item) => item.id === selection.id ? update(item) as PlatformHelpCenterTopic : item) }
  if (selection.kind === "guide") return { ...content, articles: content.articles.map((item) => item.id === selection.id ? update(item) as PlatformHelpCenterArticle : item) }
  return { ...content, faqs: content.faqs.map((item) => item.id === selection.id ? update(item) as PlatformHelpCenterFaq : item) }
}

export function PlatformHelpCenterManager({ page, onNavigate }: ManagerProps) {
  const [content, setContent] = useState<PlatformHelpCenterContent | null>(null)
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [publishedRevision, setPublishedRevision] = useState<number | null>(null)
  const [draftRevision, setDraftRevision] = useState<number | null>(null)
  const [editing, setEditing] = useState<Selection | null>(null)
  const [pendingArchive, setPendingArchive] = useState<Selection | null>(null)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await platformApi.getHelpCenterAdmin()
      setContent(result.content)
      setPublishedRevision(result.publishedRevision)
      setDraftRevision(result.draftRevision)
      setRevisions(result.revisions)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Help Center content could not be loaded.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])
  useEffect(() => {
    if (editing && selectionKind(page) !== editing.kind) setEditing(null)
  }, [editing, page])

  const selectedItem = useMemo(() => content ? getHelpItem(content, editing) : null, [content, editing])
  const activeTopicIds = useMemo(() => new Set(content?.topics.filter((item) => !item.archived).map((item) => item.id) || []), [content])
  const activeArticleIds = useMemo(() => new Set(content?.articles.filter((item) => !item.archived && activeTopicIds.has(item.topic)).map((item) => item.id) || []), [content, activeTopicIds])
  const activeGuides = content?.articles.filter((item) => activeArticleIds.has(item.id)) || []
  const activeFaqs = content?.faqs.filter((item) => !item.archived && (!item.relatedArticleId || activeArticleIds.has(item.relatedArticleId))) || []
  const reviewQueue = [...activeGuides.filter((item) => !itemReviewed(item)).map((item) => ({ kind: "guide" as const, id: item.id, label: item.title || "Untitled guide", reviewDueAt: item.review.reviewDueAt })), ...activeFaqs.filter((item) => !itemReviewed(item)).map((item) => ({ kind: "faq" as const, id: item.id, label: item.question || "Untitled FAQ", reviewDueAt: item.review.reviewDueAt }))]
  const unreviewedCount = reviewQueue.length
  const sectionKind = selectionKind(page)
  const isEditingCurrentSection = Boolean(editing && sectionKind === editing.kind)
  const title = isEditingCurrentSection && content && editing ? itemTitle(content, editing) : pageCopy[page].title

  const updateSelected = (update: (item: HelpItem) => HelpItem) => {
    if (!content || !editing) return
    setContent(updateHelpItem(content, editing, update))
    setSuccess(null)
  }

  const createItem = (kind: Kind) => {
    if (!content) return
    if (kind === "guide" && !content.topics.some((item) => !item.archived)) {
      setError("Create or restore a topic before adding a guide.")
      onNavigate("topics")
      return
    }
    const id = `new-${kind}-${Date.now()}`
    let next = content
    if (kind === "topic") {
      next = { ...content, topics: [...content.topics, { id, title: "", description: "" }] }
    } else if (kind === "guide") {
      const topic = content.topics.find((item) => !item.archived)!
      const item: PlatformHelpCenterArticle = { id, topic: topic.id, title: "", intro: "", steps: [""], note: "", link: null, linkLabel: null, review: initialReview() }
      next = { ...content, articles: [...content.articles, item] }
    } else {
      const item: PlatformHelpCenterFaq = { id, question: "", answer: "", relatedArticleId: null, review: initialReview() }
      next = { ...content, faqs: [...content.faqs, item] }
    }
    setContent(next)
    setEditing({ kind, id })
    setError(null)
    setSuccess("New item added to the working draft. Complete it and save the draft when ready.")
  }

  const saveDraft = async () => {
    if (!content || reason.trim().length < 8) { setError("Enter an audit reason of at least 8 characters."); return }
    setBusy(true); setError(null); setSuccess(null)
    try {
      const result = await platformApi.saveHelpCenterDraft(content, reason.trim())
      setDraftRevision(result.draft.revision)
      setReason("")
      setSuccess(`Draft revision ${result.draft.revision} saved. The live Help Center is unchanged.`)
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Draft could not be saved.")
    } finally { setBusy(false) }
  }

  const publish = async () => {
    if (!draftRevision || reason.trim().length < 8) { setError("Save a draft and enter an audit reason before publishing."); return }
    if (unreviewedCount > 0) { setError(`${unreviewedCount} active guide or FAQ items still need a current review date and source reference.`); return }
    setBusy(true); setError(null); setSuccess(null)
    try {
      const result = await platformApi.publishHelpCenterRevision(draftRevision, reason.trim())
      setPublishedRevision(result.publish.publishedRevision)
      setDraftRevision(null)
      setReason("")
      setSuccess(`Revision ${result.publish.publishedRevision} is now live on the public Help Center.`)
      await load()
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Help Center could not be published.")
    } finally { setBusy(false) }
  }

  const restore = async (revision: number) => {
    if (reason.trim().length < 8) { setError("Enter an audit reason before restoring a revision."); return }
    setBusy(true); setError(null); setSuccess(null)
    try {
      const result = await platformApi.restoreHelpCenterRevision(revision, reason.trim())
      setDraftRevision(result.draft.revision)
      setReason("")
      setSuccess(`Revision ${revision} was restored as draft ${result.draft.revision}; it is not live until published.`)
      await load()
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Revision could not be restored.")
    } finally { setBusy(false) }
  }

  const removeSelectedFromDraft = () => {
    if (!content || !editing) return
    try {
      const next = removeHelpCenterDraftItem(content, editing)
      setContent(next)
      setEditing(null)
      setError(null)
      setSuccess("Removed from the working draft. Save draft to record the change; earlier revisions remain available.")
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "This item could not be removed from the draft.")
    }
  }

  const confirmArchive = () => {
    if (!content || !pendingArchive) return
    if (pendingArchive.kind === "topic") {
      const topic = content.topics.find((item) => item.id === pendingArchive.id)
      if (topic) setContent({ ...content, topics: content.topics.map((item) => item.id === topic.id ? { ...item, archived: true } : item) })
    } else {
      setContent(updateHelpItem(content, pendingArchive, (item) => ({ ...item, archived: true })))
    }
    setSuccess("Item archived in the working draft. Save and publish the draft to update the public Help Center.")
    setPendingArchive(null)
  }

  const restoreItem = () => {
    if (!content || !editing) return
    setContent(updateHelpItem(content, editing, (item) => ({ ...item, archived: false })))
    setSuccess("Item restored in the working draft. Save and publish to show it in the public Help Center again.")
  }

  const openEditor = (kind: Kind, id: string) => {
    setEditing({ kind, id })
    setError(null)
    setSuccess(null)
  }

  const renderReview = (item: PlatformHelpCenterArticle | PlatformHelpCenterFaq) => (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck data-icon="inline-start" /> Review record</CardTitle><CardDescription>This internal record keeps customer-facing guidance current. It is never published.</CardDescription></CardHeader>
      <CardContent className="grid gap-4">
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field><FieldLabel>Owner</FieldLabel><Input value={item.review.owner} onChange={(event) => updateSelected((current) => ({ ...current, review: { ...item.review, owner: event.target.value } } as typeof item))} /></Field>
          <Field><FieldLabel>Applies to</FieldLabel><select className="h-9 rounded-md border bg-background px-2 text-sm" value={item.review.appliesTo.join(",")} onChange={(event) => updateSelected((current) => ({ ...current, review: { ...item.review, appliesTo: event.target.value.split(",") as Array<"web" | "mobile"> } } as typeof item))}><option value="web,mobile">Web and mobile</option><option value="web">Web</option><option value="mobile">Mobile</option></select></Field>
          <Field><FieldLabel>Last reviewed</FieldLabel><Input type="date" value={item.review.lastReviewedAt || ""} onChange={(event) => updateSelected((current) => ({ ...current, review: { ...item.review, lastReviewedAt: event.target.value || null } } as typeof item))} /></Field>
          <Field><FieldLabel>Review due</FieldLabel><Input type="date" value={item.review.reviewDueAt || ""} onChange={(event) => updateSelected((current) => ({ ...current, review: { ...item.review, reviewDueAt: event.target.value || null } } as typeof item))} /></Field>
        </FieldGroup>
        <Field><FieldLabel>Verified source references</FieldLabel><Textarea value={item.review.sourceReferences.join("\n")} onChange={(event) => updateSelected((current) => ({ ...current, review: { ...item.review, sourceReferences: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean) } } as typeof item))} placeholder="One source path or product surface per line" rows={3} /></Field>
        <div className="flex flex-wrap items-center gap-2"><Badge variant={itemReviewed(item) ? "success" : "warning"}>{itemReviewed(item) ? "Reviewed" : "Review needed"}</Badge><Button size="sm" variant="outline" onClick={() => { const date = todayInManila(); updateSelected((current) => ({ ...current, review: { ...item.review, lastReviewedAt: date, reviewDueAt: plusDays(date, item.review.cadenceDays) } } as typeof item)) }}>Mark reviewed today</Button><span className="text-xs text-muted-foreground">{item.review.cadenceDays}-day cadence · Asia/Manila</span></div>
      </CardContent>
    </Card>
  )

  const guideTopicName = (guide: PlatformHelpCenterArticle) => content?.topics.find((topic) => topic.id === guide.topic)?.title || "Unassigned topic"
  const topicColumns = useMemo<ColumnDef<PlatformHelpCenterTopic>[]>(() => [
    { accessorKey: "title", header: "Topic", cell: ({ row }) => <div><p className="font-medium">{row.original.title || "Untitled topic"}</p><p className="text-xs text-muted-foreground">{row.original.description || "No description yet"}</p></div> },
    { accessorKey: "id", header: "URL key", cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span> },
    { id: "guides", accessorFn: (row) => content?.articles.filter((article) => article.topic === row.id && !article.archived).length || 0, header: "Guides" },
    { id: "status", accessorFn: (row) => row.archived ? "Archived" : "Active", header: "Status", cell: ({ row }) => <Badge variant={row.original.archived ? "secondary" : "success"}>{row.original.archived ? "Archived" : "Active"}</Badge> },
  ], [content])
  const guideColumns = useMemo<ColumnDef<PlatformHelpCenterArticle>[]>(() => [
    { accessorKey: "title", header: "Guide", cell: ({ row }) => <div><p className="font-medium">{row.original.title || "Untitled guide"}</p><p className="text-xs text-muted-foreground">{row.original.id}</p></div> },
    { id: "topic", accessorFn: guideTopicName, header: "Topic", cell: ({ row }) => guideTopicName(row.original) },
    { id: "review", accessorFn: (row) => itemReviewed(row) ? "Current" : "Needs review", header: "Review", cell: ({ row }) => <Badge variant={itemReviewed(row.original) ? "success" : "warning"}>{itemReviewed(row.original) ? "Current" : "Needs review"}</Badge> },
    { id: "status", accessorFn: (row) => !row.archived && activeTopicIds.has(row.topic) ? "Active" : "Archived", header: "Status", cell: ({ row }) => <Badge variant={!row.original.archived && activeTopicIds.has(row.original.topic) ? "success" : "secondary"}>{!row.original.archived && activeTopicIds.has(row.original.topic) ? "Active" : row.original.archived ? "Archived" : "Hidden with topic"}</Badge> },
  ], [activeTopicIds, content])
  const faqColumns = useMemo<ColumnDef<PlatformHelpCenterFaq>[]>(() => [
    { accessorKey: "question", header: "Question", cell: ({ row }) => <div><p className="font-medium">{row.original.question || "Untitled FAQ"}</p><p className="max-w-xl truncate text-xs text-muted-foreground">{row.original.answer || "No answer yet"}</p></div> },
    { id: "relatedGuide", accessorFn: (row) => content?.articles.find((article) => article.id === row.relatedArticleId)?.title || "—", header: "Related guide" },
    { id: "review", accessorFn: (row) => itemReviewed(row) ? "Current" : "Needs review", header: "Review", cell: ({ row }) => <Badge variant={itemReviewed(row.original) ? "success" : "warning"}>{itemReviewed(row.original) ? "Current" : "Needs review"}</Badge> },
    { id: "status", accessorFn: (row) => row.archived || Boolean(row.relatedArticleId && !activeArticleIds.has(row.relatedArticleId)) ? "Archived" : "Active", header: "Status", cell: ({ row }) => <Badge variant={row.original.archived || Boolean(row.original.relatedArticleId && !activeArticleIds.has(row.original.relatedArticleId)) ? "secondary" : "success"}>{row.original.archived ? "Archived" : row.original.relatedArticleId && !activeArticleIds.has(row.original.relatedArticleId) ? "Hidden with guide" : "Active"}</Badge> },
  ], [activeArticleIds, content])

  if (loading && !content) return <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="animate-spin" /> Loading Help Center content…</div>
  if (!content) return <div className="grid gap-4"><Alert variant="destructive"><AlertTitle>Help Center unavailable</AlertTitle><AlertDescription>{error || "Content could not be loaded."}</AlertDescription></Alert><Button variant="outline" onClick={() => void load()}>Retry</Button></div>

  const isArchived = Boolean(selectedItem && "archived" in selectedItem && selectedItem.archived)
  const listItems = sectionKind === "topic" ? content.topics : sectionKind === "guide" ? content.articles : sectionKind === "faq" ? content.faqs : []
  const addLabel = sectionKind === "topic" ? "Create new topic" : sectionKind === "guide" ? "Create new guide" : "Create new FAQ"
  const listTable = sectionKind === "topic" ? <PlatformDataTable columns={topicColumns} data={content.topics} emptyMessage="No topics yet. Create a topic to start organizing Help Center content." searchColumn="title" searchPlaceholder="Filter topics…" onRowClick={(row) => openEditor("topic", row.id)} getRowLabel={(row) => `Edit topic ${row.title || row.id}`} rowActions={(row) => row.archived ? <Badge variant="secondary">Archived</Badge> : <Button variant="outline" size="sm" onClick={() => setPendingArchive({ kind: "topic", id: row.id })}><Archive data-icon="inline-start" /> Archive</Button>} />
    : sectionKind === "guide" ? <PlatformDataTable columns={guideColumns} data={content.articles} emptyMessage="No guides yet. Create a guide to add step-by-step customer help." searchColumn="title" searchPlaceholder="Filter guides…" onRowClick={(row) => openEditor("guide", row.id)} getRowLabel={(row) => `Edit guide ${row.title || row.id}`} rowActions={(row) => row.archived ? <Badge variant="secondary">Archived</Badge> : <Button variant="outline" size="sm" onClick={() => setPendingArchive({ kind: "guide", id: row.id })}><Archive data-icon="inline-start" /> Archive</Button>} />
      : sectionKind === "faq" ? <PlatformDataTable columns={faqColumns} data={content.faqs} emptyMessage="No FAQs yet. Create a short answer for a common customer question." searchColumn="question" searchPlaceholder="Filter FAQs…" onRowClick={(row) => openEditor("faq", row.id)} getRowLabel={(row) => `Edit FAQ ${row.question || row.id}`} rowActions={(row) => row.archived ? <Badge variant="secondary">Archived</Badge> : <Button variant="outline" size="sm" onClick={() => setPendingArchive({ kind: "faq", id: row.id })}><Archive data-icon="inline-start" /> Archive</Button>} /> : null

  return <div className="grid gap-5">
    <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
      <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Help Center management</p><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{isEditingCurrentSection ? title || `Untitled ${editing?.kind}` : pageCopy[page].title}</h1><p className="mt-1 max-w-3xl text-muted-foreground">{isEditingCurrentSection ? "Edit customer-facing content and its internal review record." : pageCopy[page].description}</p></div>
      <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">Live revision {publishedRevision ?? "—"}</Badge>{draftRevision ? <Badge variant="warning">Draft {draftRevision}</Badge> : null}</div>
    </header>

    {error ? <Alert variant="destructive"><AlertTitle>Help Center action needs attention</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {success ? <Alert><AlertTitle>Help Center updated</AlertTitle><AlertDescription>{success}</AlertDescription></Alert> : null}

    {page === "overview" && !isEditingCurrentSection ? <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Active topics", value: activeTopicIds.size, page: "topics" as const, icon: BookOpenText, iconAccent: "bg-brand-subtle text-brand" },
          { label: "Active guides", value: activeGuides.length, page: "guides" as const, icon: FileText, iconAccent: "bg-chart-2/10 text-chart-2" },
          { label: "Active FAQs", value: activeFaqs.length, page: "faqs" as const, icon: CircleHelp, iconAccent: "bg-chart-4/10 text-chart-4" },
          { label: "Needs review", value: unreviewedCount, page: "guides" as const, icon: ShieldCheck, iconAccent: unreviewedCount ? "bg-warning/10 text-warning" : "bg-success/10 text-success" },
        ].map((metric) => <PlatformMetricCard key={metric.label} label={metric.label} value={metric.value} icon={metric.icon} iconClassName={metric.iconAccent} supportingContent={<Button variant="link" className="h-auto p-0 text-xs font-normal text-muted-foreground underline-offset-4 hover:text-foreground" onClick={() => onNavigate(metric.page)}>{metric.label === "Needs review" ? "Review content" : `Manage ${metric.label.toLowerCase()}`} <Plus data-icon="inline-end" /></Button>} />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><span className={cn("grid size-8 place-items-center rounded-md", unreviewedCount ? "bg-warning/10 text-warning" : "bg-success/10 text-success")}><ShieldCheck aria-hidden="true" /></span>Needs review</CardTitle><CardDescription>{unreviewedCount ? "These active items need an owner review date and verified source." : "All active guides and FAQs have a current review record."}</CardDescription></CardHeader><CardContent className="grid gap-2">
          {reviewQueue.slice(0, 8).map((item) => <button key={`${item.kind}:${item.id}`} className="flex min-h-12 items-center justify-between gap-3 rounded-md border px-3 py-2 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring" onClick={() => { setEditing({ kind: item.kind, id: item.id }); onNavigate(item.kind === "guide" ? "guides" : "faqs") }}><span className="flex min-w-0 items-center gap-2"><span className="grid size-8 shrink-0 place-items-center rounded-md bg-warning/10 text-warning">{item.kind === "guide" ? <FileText aria-hidden="true" /> : <CircleHelp aria-hidden="true" />}</span><span className="truncate text-sm">{item.label}</span></span><span className="flex shrink-0 items-center gap-2"><Badge variant="warning">Needs review</Badge><span className="text-xs text-muted-foreground">{item.reviewDueAt || "No date"}</span></span></button>)}
          {!unreviewedCount ? <div className="flex items-center gap-3 rounded-md border border-success/20 bg-success/5 p-4"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-success/10 text-success"><ShieldCheck aria-hidden="true" /></span><p className="text-sm text-muted-foreground">No review actions are due right now.</p></div> : null}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Content areas</CardTitle><CardDescription>Jump to the section you want to manage.</CardDescription></CardHeader><CardContent className="grid gap-2">{(["topics", "guides", "faqs"] as const).map((section) => { const Icon = section === "topics" ? BookOpenText : section === "guides" ? FileText : CircleHelp; const accent = section === "topics" ? "bg-brand-subtle text-brand" : section === "guides" ? "bg-chart-2/10 text-chart-2" : "bg-chart-4/10 text-chart-4"; return <Button key={section} variant="outline" className="h-auto justify-between py-3" onClick={() => onNavigate(section)}><span className="flex items-center gap-3"><span className={cn("grid size-9 place-items-center rounded-md", accent)}><Icon aria-hidden="true" /></span><span>{pageCopy[section].title}</span></span><Badge variant="secondary">{section === "topics" ? content.topics.length : section === "guides" ? content.articles.length : content.faqs.length} items</Badge></Button> })}</CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><span className="grid size-8 place-items-center rounded-md bg-brand-subtle text-brand"><History aria-hidden="true" /></span>Revision history</CardTitle><CardDescription>Restore a prior draft as a new revision; publishing remains a separate action. Enter an audit reason in the controls below to enable restore.</CardDescription></CardHeader><CardContent className="grid gap-2">{revisions.slice(0, 5).map((item) => <div key={item.revision} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-0"><span className="text-sm">Revision {item.revision} · {item.changeReason}</span><div className="flex items-center gap-2">{item.publishedAt ? <Badge variant="secondary">Published</Badge> : <><Badge variant="warning">Draft</Badge><Button size="sm" variant="ghost" disabled={busy || reason.trim().length < 8} onClick={() => void restore(item.revision)}><RotateCcw data-icon="inline-start" /> Restore</Button></>}</div></div>)}{!revisions.length ? <p className="text-sm text-muted-foreground">No saved revisions yet.</p> : null}</CardContent></Card>
    </> : null}

    {sectionKind && !isEditingCurrentSection ? <Card><CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>{pageCopy[page].title}</CardTitle><CardDescription>{listItems.length} total · includes archived content for history and restoration</CardDescription></div><Button onClick={() => createItem(sectionKind)}><Plus data-icon="inline-start" />{addLabel}</Button></CardHeader><CardContent className="grid gap-3"><div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">Select a row to edit it. Archive moves content out of the next published Help Center; saved revisions are preserved.</div>{listTable}</CardContent></Card> : null}

    {isEditingCurrentSection && editing && selectedItem ? <>
      <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" onClick={() => setEditing(null)}><ArrowLeft data-icon="inline-start" />Back to {pageCopy[sectionForKind(editing.kind)].title}</Button><Badge variant={isArchived ? "secondary" : "success"}>{isArchived ? "Archived" : "Active"}</Badge></div>
      <Card><CardHeader><CardTitle>{title || `Untitled ${editing.kind}`}</CardTitle><CardDescription>Changes stay in your working copy until you save a draft. Public content changes only after a reviewed draft is published.</CardDescription></CardHeader><CardContent className="grid gap-5">
        {editing.kind === "topic" && selectedItem ? <FieldGroup className="grid gap-4"><Field><FieldLabel>Topic title</FieldLabel><Input value={(selectedItem as PlatformHelpCenterTopic).title} onChange={(event) => updateSelected((item) => ({ ...item, title: event.target.value } as PlatformHelpCenterTopic))} /></Field><Field><FieldLabel>Description</FieldLabel><Textarea rows={3} value={(selectedItem as PlatformHelpCenterTopic).description} onChange={(event) => updateSelected((item) => ({ ...item, description: event.target.value } as PlatformHelpCenterTopic))} /></Field><Field><FieldLabel>Stable URL key</FieldLabel><Input value={selectedItem.id} disabled /><p className="text-xs text-muted-foreground">The URL key is stable so existing topic links are not broken.</p></Field></FieldGroup> : null}
        {editing.kind === "guide" && selectedItem ? (() => { const guide = selectedItem as PlatformHelpCenterArticle; return <div className="grid gap-5"><FieldGroup className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel>Stable URL ID</FieldLabel><Input value={guide.id} onChange={(event) => { const next = event.target.value; setContent((current) => current ? { ...current, articles: current.articles.map((item) => item.id === guide.id ? { ...item, id: next } : item), faqs: current.faqs.map((faq) => faq.relatedArticleId === guide.id ? { ...faq, relatedArticleId: next } : faq) } : current); setEditing({ kind: "guide", id: next }) }} /></Field><Field><FieldLabel>Topic</FieldLabel><select className="h-9 rounded-md border bg-background px-2 text-sm" value={guide.topic} onChange={(event) => updateSelected((item) => ({ ...item, topic: event.target.value } as PlatformHelpCenterArticle))}>{content.topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title || topic.id}</option>)}</select></Field></FieldGroup><FieldGroup className="grid gap-4"><Field><FieldLabel>Guide title</FieldLabel><Input value={guide.title} onChange={(event) => updateSelected((item) => ({ ...item, title: event.target.value } as PlatformHelpCenterArticle))} /></Field><Field><FieldLabel>Introduction</FieldLabel><Textarea rows={2} value={guide.intro} onChange={(event) => updateSelected((item) => ({ ...item, intro: event.target.value } as PlatformHelpCenterArticle))} /></Field><Field><FieldLabel>Steps <span className="font-normal text-muted-foreground">· one step per line</span></FieldLabel><Textarea rows={6} value={guide.steps.join("\n")} onChange={(event) => updateSelected((item) => ({ ...item, steps: event.target.value.split("\n") } as PlatformHelpCenterArticle))} /></Field><Field><FieldLabel>Good to know</FieldLabel><Textarea rows={3} value={guide.note} onChange={(event) => updateSelected((item) => ({ ...item, note: event.target.value } as PlatformHelpCenterArticle))} /></Field></FieldGroup><FieldGroup className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel>Internal link path (optional)</FieldLabel><Input value={guide.link || ""} onChange={(event) => updateSelected((item) => ({ ...item, link: event.target.value || null } as PlatformHelpCenterArticle))} placeholder="/privacy-policy" /></Field><Field><FieldLabel>Link label</FieldLabel><Input value={guide.linkLabel || ""} onChange={(event) => updateSelected((item) => ({ ...item, linkLabel: event.target.value || null } as PlatformHelpCenterArticle))} /></Field></FieldGroup><div className="rounded-lg border bg-muted/20 p-4"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer preview</p><div className="grid gap-2"><h2 className="text-xl font-semibold">{guide.title || "Guide title"}</h2><p className="text-sm text-muted-foreground">{guide.intro || "Introduction preview"}</p><ol className="list-decimal space-y-1 pl-5 text-sm">{guide.steps.filter(Boolean).map((step, index) => <li key={index}>{step}</li>)}</ol><p className="text-sm"><strong>Good to know: </strong>{guide.note}</p></div></div>{renderReview(guide)}</div> })() : null}
        {editing.kind === "faq" && selectedItem ? (() => { const faq = selectedItem as PlatformHelpCenterFaq; return <div className="grid gap-5"><FieldGroup className="grid gap-4"><Field><FieldLabel>Stable FAQ ID</FieldLabel><Input value={faq.id} onChange={(event) => { const next = event.target.value; setContent((current) => current ? { ...current, faqs: current.faqs.map((item) => item.id === faq.id ? { ...item, id: next } : item) } : current); setEditing({ kind: "faq", id: next }) }} /></Field><Field><FieldLabel>Question</FieldLabel><Input value={faq.question} onChange={(event) => updateSelected((item) => ({ ...item, question: event.target.value } as PlatformHelpCenterFaq))} /></Field><Field><FieldLabel>Answer</FieldLabel><Textarea rows={5} value={faq.answer} onChange={(event) => updateSelected((item) => ({ ...item, answer: event.target.value } as PlatformHelpCenterFaq))} /></Field><Field><FieldLabel>Related guide</FieldLabel><select className="h-9 rounded-md border bg-background px-2 text-sm" value={faq.relatedArticleId || ""} onChange={(event) => updateSelected((item) => ({ ...item, relatedArticleId: event.target.value || null } as PlatformHelpCenterFaq))}><option value="">None</option>{content.articles.map((article) => <option key={article.id} value={article.id}>{article.title || article.id}</option>)}</select></Field></FieldGroup><div className="rounded-lg border bg-muted/20 p-4"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer preview</p><div className="grid gap-2"><h2 className="text-lg font-semibold">{faq.question || "Question preview"}</h2><p className="text-sm text-muted-foreground">{faq.answer || "Answer preview"}</p></div></div>{renderReview(faq)}</div> })() : null}
        <div className="flex flex-wrap gap-2 border-t pt-4">{isArchived ? <Button variant="outline" disabled={busy} onClick={restoreItem}><RotateCcw data-icon="inline-start" />Restore item</Button> : <Button variant="outline" disabled={busy} onClick={() => setPendingArchive(editing)}><Archive data-icon="inline-start" />Archive</Button>}{!isArchived ? <Button variant="destructive" disabled={busy} onClick={removeSelectedFromDraft}><FileText data-icon="inline-start" />Remove from draft</Button> : null}</div>
      </CardContent></Card>
    </> : null}

    <Card><CardContent className="grid gap-3 pt-5"><div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_auto_auto]"><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Audit reason (8–500 characters)" maxLength={500} aria-label="Audit reason" /><Button variant="outline" disabled={busy || reason.trim().length < 8} onClick={() => void saveDraft()}>{busy ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />} Save draft</Button><Button disabled={busy || !draftRevision || unreviewedCount > 0 || reason.trim().length < 8} onClick={() => void publish()}>{busy ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />} Publish</Button></div>{unreviewedCount > 0 ? <p className="text-xs text-muted-foreground">Publishing is locked until each active guide and FAQ has a current review date and at least one verified source reference ({unreviewedCount} need review).</p> : null}</CardContent></Card>

    <Dialog open={Boolean(pendingArchive)} onOpenChange={(open) => { if (!open) setPendingArchive(null) }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Archive {pendingArchive?.kind === "topic" ? "topic" : pendingArchive?.kind === "guide" ? "guide" : "FAQ"}?</DialogTitle><DialogDescription>{pendingArchive ? itemTitle(content, pendingArchive) : ""}. This hides the item from the next published Help Center; saved revisions remain available. If you archive a topic, its guides and linked FAQs will also be hidden until the topic is restored.</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" onClick={() => setPendingArchive(null)}>Cancel</Button><Button variant="destructive" onClick={confirmArchive}><Archive data-icon="inline-start" />Archive</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}
