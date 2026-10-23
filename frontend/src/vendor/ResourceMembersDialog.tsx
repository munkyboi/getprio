import { useEffect, useRef, useState, type DragEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconGripVertical,
  IconDots,
  IconCircleCheck,
  IconLock,
  IconEyeOff,
  IconHelpCircle,
  IconArchive,
  IconInfoCircle,
} from "@tabler/icons-react";
import { ApiError } from "../api/client";
import {
  listResourceMembers,
  archiveResourceMember,
  saveResourceMember,
  reorderResourceMembers,
  type ResourceMember,
  type ResourceMemberWrite,
  type ResourceMemberRegistry,
} from "../api/resourceMembers";
import { ManagedCollection } from "./ManagedCollection";
import { ConfigurationCheck, ConfigurationInput } from "./ConfigurationUi";
import { TaskDialog, QueueConfirmation } from "./TaskDialog";
import { Button } from "./components/ui/button";
import { Switch } from "./components/ui/switch";
import { Badge } from "./components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./components/ui/tooltip";

type Edit = {
  id: string | null;
  name: string;
  isActive: boolean;
  displayOrder?: number;
  revision?: string;
  initial: string;
};
type Command =
  | {
      id: string | null;
      body: ResourceMemberWrite;
      key: string;
      action?: "save";
    }
  | {
      id: string;
      body: { expectedRevision: string };
      key: string;
      action: "archive";
    };
export function memberCollectionStatus(
  member: Pick<ResourceMember, "archivedAt">,
): "active" | "archived" {
  return member.archivedAt ? "archived" : "active";
}
function observationBadge(state: ResourceMember["availability"]["state"]) {
  if (state === "provisional_free")
    return { label: "Observed free", className: "is-free", Icon: IconCircleCheck };
  if (state === "occupied" || state === "protected")
    return { label: state === "protected" ? "Reserved" : "In use", className: "is-held", Icon: IconLock };
  if (state === "inactive")
    return { label: "Temporarily disabled", className: "is-disabled", Icon: IconEyeOff };
  if (state === "archived")
    return { label: "Archived", className: "is-unknown", Icon: IconArchive };
  return { label: "Availability unknown", className: "is-unknown", Icon: IconHelpCircle };
}
function orderMembers(members: ResourceMember[]) {
  return members
    .map((member, index) => ({ member, index }))
    .sort(
      (left, right) =>
        left.member.displayOrder - right.member.displayOrder ||
        left.index - right.index,
    )
    .map(({ member }) => member);
}
export function memberToggleCommand(
  member: ResourceMember,
  enabled: boolean,
  key: string,
): Command {
  return {
    id: member.id,
    body: {
      name: member.name,
      isActive: enabled,
      displayOrder: member.displayOrder,
      expectedRevision: member.revision,
    },
    key,
  };
}
export function memberToggleBlockedReason(
  member: ResourceMember,
  poolArchived: boolean,
): string | undefined {
  if (member.archivedAt === undefined)
    return "Archive status is unavailable. Refresh resources before changing this member.";
  if (member.archivedAt)
    return "This resource is archived; enabling and editing are blocked.";
  if (poolArchived)
    return "This pool is archived; resource changes are blocked.";
  if (
    member.isActive &&
    ["occupied", "protected"].includes(member.availability.state)
  )
    return "This resource is currently held. Complete or release it through its normal queue action before disabling; this switch never releases occupancy.";
  return undefined;
}
function edit(member?: ResourceMember): Edit {
  const fields = {
    name: member?.name || "",
    isActive: member?.isActive ?? true,
    displayOrder: member?.displayOrder,
  };
  return {
    id: member?.id || null,
    ...fields,
    revision: member?.revision,
    initial: JSON.stringify(fields),
  };
}
function changed(value: Edit | null) {
  return Boolean(
    value &&
    JSON.stringify({ name: value.name, isActive: value.isActive, displayOrder: value.displayOrder }) !==
      value.initial,
  );
}
export function ResourceMembersDialog({
  token,
  tenant,
  location,
  poolId,
  poolArchived,
  onClose,
  onBusyChange,
  onNotice,
  onDiscard,
}: {
  token: string;
  tenant: string;
  location: string;
  poolId: string;
  poolArchived: boolean;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
  onNotice: (message: string) => void;
  onDiscard: () => void;
}) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["resource-members", token, tenant, location, poolId],
    queryFn: ({ signal }) =>
      listResourceMembers(token, tenant, location, poolId, signal),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [editor, setEditor] = useState<Edit | null>(null),
    [archive, setArchive] = useState<ResourceMember | null>(null),
    [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(false),
    [error, setError] = useState(""),
    [toggleMemberId, setToggleMemberId] = useState<string | null>(null),
    [discard, setDiscard] = useState<"close" | "list" | null>(null);
  const [dragMemberId, setDragMemberId] = useState<string | null>(null),
    [dragOverMemberId, setDragOverMemberId] = useState<string | null>(null),
    [menuMemberId, setMenuMemberId] = useState<string | null>(null);
  const pending = useRef<Command | null>(null);
  const dragPreview = useRef<HTMLDivElement | null>(null);

  const clearDragPreview = () => {
    dragPreview.current?.remove();
    dragPreview.current = null;
    setDragMemberId(null);
    setDragOverMemberId(null);
  };

  const startDragging = (event: DragEvent<HTMLSpanElement>, member: ResourceMember) => {
    const preview = document.createElement("div");
    preview.className = "named-resource-drag-preview";
    preview.setAttribute("aria-hidden", "true");
    preview.textContent = member.name;
    document.body.appendChild(preview);
    dragPreview.current = preview;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setDragImage(preview, 18, 20);
    setDragMemberId(member.id);
    setDragOverMemberId(null);
  };
  useEffect(() => {
    const cleanupDocumentDrag = () => clearDragPreview();
    document.addEventListener("dragend", cleanupDocumentDrag);
    document.addEventListener("drop", cleanupDocumentDrag);
    return () => {
      document.removeEventListener("dragend", cleanupDocumentDrag);
      document.removeEventListener("drop", cleanupDocumentDrag);
      dragPreview.current?.remove();
    };
  }, []);
  useEffect(() => {
    onBusyChange(busy || unknown);
    return () => onBusyChange(false);
  }, [busy, unknown, onBusyChange]);
  useEffect(() => {
    if (!unknown && !busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unknown, busy]);
  const active =
    query.data?.members.filter(
      (member) => member.isActive && !member.archivedAt,
    ).length || 0;
  const full = Boolean(query.data && active >= query.data.pool.capacity),
    locked = busy || unknown;
  function leave(target: "close" | "list") {
    if (locked) return;
    if (changed(editor)) {
      setDiscard(target);
      return;
    }
    setEditor(null);
    setArchive(null);
    onDiscard();
    setError("");
    if (target === "close") onClose();
  }
  async function send(command?: Command) {
    if (busy || poolArchived) return;
    if (!pending.current && command) pending.current = command;
    if (!pending.current) return;
    setBusy(true);
    setError("");
    const controller = new AbortController();
    const deadline = window.setTimeout(() => controller.abort(), 30000);
    try {
      const c = pending.current;
      const response =
        c.action === "archive"
          ? await archiveResourceMember(
              token,
              tenant,
              location,
              c.id,
              c.body,
              c.key,
              controller.signal,
            )
          : await saveResourceMember(
              token,
              tenant,
              location,
              c.id,
              c.body,
              c.key,
              controller.signal,
            );
      client.setQueryData<ResourceMemberRegistry>(
        ["resource-members", token, tenant, location, poolId],
        (current) =>
          current
            ? {
                ...current,
                members: current.members.map((member) =>
                  member.id === response.member.id
                    ? {
                        ...member,
                        ...response.member,
                        availability: {
                          ...member.availability,
                          state: response.member.isActive
                            ? "unknown"
                            : "inactive",
                          provisional: true,
                        },
                      }
                    : member,
                ),
              }
            : current,
      );
      pending.current = null;
      setUnknown(false);
      setEditor(null);
      setArchive(null);
      onDiscard();
      onNotice(
        "Resource saved. Its stable identity and recorded history are preserved.",
      );
      void query.refetch();
    } catch (e) {
      setError(
        e instanceof Error && e.name === "AbortError"
          ? "The request timed out. Its outcome is unknown; retry the same command to confirm it."
          : e instanceof Error
            ? e.message
            : "Resource could not be saved.",
      );
      const uncertain = !(e instanceof ApiError) || e.status >= 500;
      setUnknown(uncertain);
      if (!uncertain) pending.current = null;
      if (
        e instanceof ApiError &&
        (e.code === "STALE_REVISION" ||
          e.code === "RESOURCE_CONFIGURATION_CHANGED")
      )
        void query.refetch();
    } finally {
      window.clearTimeout(deadline);
      setBusy(false);
    }
  }
  function submit() {
    if (!editor || poolArchived) return;
    if (!editor.name.trim() || editor.name.trim().length > 120) {
      setError("Enter a resource name up to 120 characters.");
      return;
    }
    void send({
      id: editor.id,
      body: {
        name: editor.name.trim(),
        isActive: editor.isActive,
        ...(editor.displayOrder === undefined ? {} : { displayOrder: editor.displayOrder }),
        ...(editor.id ? { expectedRevision: editor.revision } : { poolId }),
      },
      key: crypto.randomUUID(),
    });
  }
  async function reorder(draggedId: string, targetId: string) {
    if (!query.data || draggedId === targetId || locked || poolArchived) return;
    const ordered = orderMembers(
      query.data.members.filter((member) => !member.archivedAt),
    );
    const from = ordered.findIndex((member) => member.id === draggedId);
    const to = ordered.findIndex((member) => member.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...ordered];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const ids = next.map((member) => member.id);
    const positioned = next.map((member, index) => ({ ...member, displayOrder: index }));
    client.setQueryData<ResourceMemberRegistry>(["resource-members", token, tenant, location, poolId], (current) => current ? { ...current, members: [...positioned, ...current.members.filter((member) => member.archivedAt)] } : current);
    setBusy(true);
    try {
      await reorderResourceMembers(token, tenant, location, poolId, ids, crypto.randomUUID());
      // Reordering bumps every member revision on the server. Refresh the
      // registry before allowing another edit so the next mutation is based
      // on those current revisions.
      await query.refetch();
      onNotice("Resource order saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Resource order could not be saved.");
      void query.refetch();
    } finally {
      setBusy(false);
      setDragMemberId(null);
    }
  }
  const pool = query.data?.pool;
  return (
    <>
      <TaskDialog
        opened
        title={
          archive
            ? `Archive ${archive.name}?`
            : editor
              ? `${editor.id ? "Edit" : "Add"} resource`
              : `Resources · ${pool?.name || "Pool"}`
        }
        description={
          poolArchived
            ? "This pool is archived. Recorded resources remain available to view."
            : `${active} active resources of ${pool?.capacity ?? "—"} configured capacity. Named resources use one unit each; capacity is not increased automatically.`
        }
        busy={locked}
        onClose={() => leave("close")}
        footer={
          <>
            <Button
              variant="outline"
              disabled={locked}
              onClick={() => leave(editor || archive ? "list" : "close")}
            >
              {editor || archive ? "Back to resources" : "Back to pools"}
            </Button>
            {unknown ? (
              <Button disabled={busy} onClick={() => void send()}>
                Retry same resource command
              </Button>
            ) : archive ? (
              <Button
                disabled={busy || poolArchived}
                onClick={() =>
                  void send({
                    id: archive.id,
                    action: "archive",
                    body: {
                      expectedRevision: archive.revision,
                    },
                    key: crypto.randomUUID(),
                  })
                }
              >
                Archive resource
              </Button>
            ) : editor ? (
              <Button
                type="submit"
                form="resource-member-editor"
                disabled={busy || poolArchived || !editor.name.trim()}
              >
                Save resource
              </Button>
            ) : null}
          </>
        }
      >
        <div className="queue-stack">
          {error ? <p role="alert">{error}</p> : null}
          {unknown ? (
            <p role="alert">
              The response was lost. Retry the exact command before editing or
              closing.
            </p>
          ) : null}
          {poolArchived ? (
            <p>
              New resources and edits are blocked for this archived pool.
              Existing occupancy is unchanged.
            </p>
          ) : null}
          {archive ? (
            <p>
              Archiving keeps this resource’s identity and history and is
              separate from temporary disabling. An archived resource cannot be
              re-enabled here. A held resource must finish or release through
              its normal queue action first; archiving does not release
              occupancy.
            </p>
          ) : editor ? (
            <form
              id="resource-member-editor"
              className="queue-stack"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <ConfigurationInput
                label="Resource name"
                maxLength={120}
                value={editor.name}
                disabled={locked || poolArchived}
                onChange={(event) =>
                  setEditor({ ...editor, name: event.currentTarget.value })
                }
              />
              <ConfigurationCheck
                label="Enabled resource"
                checked={editor.isActive}
                disabled={locked || poolArchived}
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    isActive: event.currentTarget.checked,
                  })
                }
              />
              <p>
                Enabled named resources count toward the pool’s configured
                capacity. Re-enabling a disabled resource retains its identity;
                the server checks current capacity and holds.
              </p>
            </form>
          ) : (
            <>
              {query.isPending ? (
                <p role="status">Loading resources…</p>
              ) : query.isError ? (
                <div role="alert">
                  <p>
                    {query.error instanceof Error
                      ? query.error.message
                      : "Resources could not be loaded."}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => void query.refetch()}
                  >
                    Retry resources
                  </Button>
                </div>
              ) : null}
              <p>
                Disabling removes this resource from named selection and
                reduces the pool capacity by one. Re-enabling restores it.
              </p>
              <div className="queue-row">
                <Button
                  disabled={locked || poolArchived || !pool || full}
                  onClick={() => {
                    setError("");
                    setEditor(edit());
                  }}
                >
                  Add resource
                </Button>
                <Button
                  variant="outline"
                  disabled={locked || query.isFetching}
                  onClick={() => void query.refetch()}
                >
                  Refresh resources
                </Button>
              </div>
              {full && !poolArchived ? (
                <p role="status">
                  All configured active resource slots are used. Disable an
                  unused resource or review pool capacity before adding another
                  active resource.
                </p>
              ) : null}
              {query.data ? (
                <ManagedCollection
                  items={orderMembers(query.data.members)}
                  label="resources"
                  defaultStatus="active"
                  statusTabs
                  statuses={[
                    { value: "active", label: "Active" },
                    { value: "archived", label: "Archived" },
                  ]}
                  statusOf={memberCollectionStatus}
                  searchText={(member) =>
                    `${member.name} ${member.archivedAt ? "Archived" : member.isActive ? "Enabled" : "Inactive"}`
                  }
                >
                  {(items) => (
                    <TooltipProvider>
                    <ul className="named-resource-list" aria-label="Named resources">
                      {items.map((member) => {
                        const held = ["occupied", "protected"].includes(
                          member.availability.state,
                        );
                        const blockedReason = memberToggleBlockedReason(
                          member,
                          poolArchived,
                        );
                        // An inactive resource is intentionally off, but it must remain
                        // manageable so an operator can turn it back on. Only a resource
                        // currently held by queue work is action-blocked.
                        const observationBlocksActions = held;
                        return (
                          <li
                            key={member.id}
                            className={`named-resource-row${dragOverMemberId === member.id && dragMemberId !== member.id ? " is-drag-over" : ""}${menuMemberId === member.id ? " is-menu-open" : ""}`}
                            onDragOver={(event) => {
                              event.preventDefault();
                              if (dragMemberId && dragMemberId !== member.id) {
                                setDragOverMemberId(member.id);
                              }
                            }}
                            onDragLeave={(event) => {
                              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                                setDragOverMemberId(null);
                              }
                            }}
                            onDrop={() => {
                              if (dragMemberId && dragMemberId !== member.id) {
                                void reorder(dragMemberId, member.id);
                              }
                              clearDragPreview();
                            }}
                          >
                            <span
                              className="named-resource-grip"
                              role="button"
                              tabIndex={member.archivedAt || locked ? -1 : 0}
                              aria-label={`Reorder ${member.name}`}
                              draggable={!member.archivedAt && !locked}
                              onDragStart={(event) => startDragging(event, member)}
                              onDragEnd={clearDragPreview}
                              onKeyDown={(event) => {
                                if (event.key === " " || event.key === "Enter") {
                                  event.preventDefault();
                                }
                              }}
                            >
                              <IconGripVertical aria-hidden="true" />
                            </span>
                            <div className="named-resource-main">
                              <div className="named-resource-title">
                                <strong>{member.name}</strong>
                                <Badge variant={member.isActive && !member.archivedAt ? "success" : "secondary"}>{member.archivedAt ? "Archived" : member.isActive ? "Enabled" : "Inactive"}</Badge>
                                {(() => { const status = observationBadge(member.availability.state); const StatusIcon = status.Icon; return <span className={`resource-observation-icon ${status.className}`} role="img" aria-label={`${member.name}: ${status.label}`}><StatusIcon aria-hidden="true" /></span>; })()}
                                {blockedReason ? <Tooltip><TooltipTrigger render={<Button type="button" variant="ghost" size="icon" className="resource-status-info" aria-label={`Why ${member.name} cannot be changed`} />}><IconInfoCircle aria-hidden="true" /></TooltipTrigger><TooltipContent side="top" className="v:max-w-[calc(100vw-32px)] v:break-words">{blockedReason}</TooltipContent></Tooltip> : null}
                              </div>
                              <span id={`member-status-${member.id}`} className="v:sr-only">{blockedReason || observationBadge(member.availability.state).label}</span>
                            </div>
                            <div className="named-resource-actions">
                              <div className="location-toggle">
                                  <Switch
                                    className="v:after:-inset-y-3.5"
                                    aria-label={`Enable ${member.name} resource`}
                                    checked={
                                      member.isActive && !member.archivedAt
                                    }
                                    disabled={
                                      locked ||
                                      query.isFetching ||
                                      Boolean(blockedReason) ||
                                      observationBlocksActions
                                    }
                                    aria-busy={
                                      busy && toggleMemberId === member.id
                                    }
                                    aria-describedby={
                                      blockedReason
                                        ? `member-status-${member.id}`
                                        : error && toggleMemberId === member.id
                                          ? `member-error-${member.id}`
                                          : undefined
                                    }
                                    onCheckedChange={(enabled) => {
                                      setToggleMemberId(member.id);
                                      void send(
                                        memberToggleCommand(
                                          member,
                                          enabled,
                                          crypto.randomUUID(),
                                        ),
                                      );
                                    }}
                                  />
                                  <span role="status">
                                    {busy && toggleMemberId === member.id
                                      ? "Saving…"
                                      : member.isActive && !member.archivedAt
                                        ? "On"
                                        : "Off"}
                                  </span>
                              </div>
                                {error && toggleMemberId === member.id ? (
                                  <p
                                    id={`member-error-${member.id}`}
                                    role="alert"
                                  >
                                    {error}
                                  </p>
                                ) : null}
                              <Button type="button" variant="ghost" size="icon" aria-label={`More actions for ${member.name}`} disabled={locked || query.isFetching || Boolean(blockedReason) || observationBlocksActions} onClick={() => setMenuMemberId(menuMemberId === member.id ? null : member.id)}><IconDots aria-hidden="true" /></Button>
                              {menuMemberId === member.id ? <div className="named-resource-menu"><Button type="button" variant="ghost" disabled={observationBlocksActions} onClick={() => { setMenuMemberId(null); setError(""); setEditor(edit(member)); }}>Edit resource</Button>{member.archivedAt === null ? <Button type="button" variant="ghost" disabled={observationBlocksActions} onClick={() => { setMenuMemberId(null); setError(""); setArchive(member); }}>Archive resource</Button> : null}</div> : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    </TooltipProvider>
                  )}
                </ManagedCollection>
              ) : null}
            </>
          )}
        </div>
      </TaskDialog>
      <QueueConfirmation
        opened={Boolean(discard)}
        title="Discard resource changes?"
        description="Only unsaved edits to this resource will be discarded."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onClose={() => setDiscard(null)}
        onConfirm={() => {
          const target = discard;
          setDiscard(null);
          setEditor(null);
          setArchive(null);
          onDiscard();
          setError("");
          if (target === "close") onClose();
        }}
      />
    </>
  );
}
