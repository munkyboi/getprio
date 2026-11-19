import { useId, useState } from "react";
import {
  IconEdit,
  IconTrash,
  IconArchive,
  IconUsers,
  IconInfoCircle,
} from "@tabler/icons-react";
import { EntityGrid, EntityCard, EntityIconAction } from "./EntityCards";
import { Button } from "./components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "./components/ui/tooltip";
import { Badge } from "./components/ui/badge";
import {
  resourceServiceName,
  resourceUnits,
  type ResourceConfiguration,
} from "../components/VendorResourceConfigurationForms";

function PoolDeletionInfo({ name, reason }: { name: string; reason: string }) {
  const [open, setOpen] = useState(false);
  const descriptionId = useId();
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        aria-describedby={open ? descriptionId : undefined}
        closeOnClick={false}
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Why ${name} pool cannot be deleted`}
            onClick={() => setOpen(true)}
          />
        }
      >
        <IconInfoCircle aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent
        id={descriptionId}
        role="tooltip"
        className="pool-deletion-tooltip"
        side="bottom"
        align="start"
      >
        <p>{reason}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function ResourcePoolsGrid({
  data,
  items,
  disabled,
  onEdit,
  onMembers,
  onArchive,
  onDelete,
}: {
  data: ResourceConfiguration;
  items: ResourceConfiguration["pools"];
  disabled: boolean;
  onEdit: (id: string) => void;
  onMembers?: (id: string) => void;
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  return (
    <EntityGrid label="Resource pools">
      {items.map((pool) => (
        <EntityCard
          key={pool.id}
          title={pool.name}
          badges={
            <span className="pool-status-info">
              <Badge
                variant={
                  pool.archived_at
                    ? "secondary"
                    : pool.tracking_enabled
                      ? "warning"
                      : "info"
                }
              >
                {pool.archived_at
                  ? "Archived"
                  : pool.tracking_enabled
                    ? "Tracking active"
                    : "Configured"}
              </Badge>
              {pool.deletion &&
              !pool.deletion.allowed &&
              pool.deletion.message.trim() ? (
                <PoolDeletionInfo
                  name={pool.name}
                  reason={pool.deletion.message}
                />
              ) : null}
            </span>
          }
          footer={
            <div className="location-icon-actions">
              <EntityIconAction
                label={
                  pool.tracking_enabled
                    ? `Edit ${pool.name} pool`
                    : `Edit ${pool.name} pool`
                }
                disabled={
                  disabled ||
                  Boolean(pool.archived_at)
                }
                onClick={() => onEdit(pool.id)}
              >
                <IconEdit aria-hidden="true" />
              </EntityIconAction>
              {onMembers && pool.archived_at !== undefined ? (
                <EntityIconAction
                  label={`Manage ${pool.name} resources`}
                  disabled={disabled}
                  onClick={() => onMembers(pool.id)}
                >
                  <IconUsers aria-hidden="true" />
                </EntityIconAction>
              ) : null}
              {onArchive && pool.deletion && !pool.archived_at ? (
                <EntityIconAction
                  label={`Archive ${pool.name} pool`}
                  disabled={disabled || !pool.deletion.archiveAllowed}
                  onClick={() => onArchive(pool.id)}
                >
                  <IconArchive aria-hidden="true" />
                </EntityIconAction>
              ) : null}
              {onDelete && pool.deletion ? (
                <EntityIconAction
                  label={`Delete ${pool.name} pool`}
                  disabled={disabled || !pool.deletion.allowed}
                  onClick={() => onDelete(pool.id)}
                >
                  <IconTrash aria-hidden="true" />
                </EntityIconAction>
              ) : null}
            </div>
          }
        >
          <p className="ops-muted">{resourceUnits(pool.capacity)} configured</p>
          <p className="ops-muted">
            {
              data.requirements.filter((item) => item.pool_id === pool.id)
                .length
            }{" "}
            service requirement
            {data.requirements.filter((item) => item.pool_id === pool.id)
              .length === 1
              ? ""
              : "s"}
          </p>
          {pool.archived_at ? (
            <p>
              Archived pools cannot accept new resource use. Existing holds and
              history are retained.
            </p>
          ) : (
            <p className="ops-muted">
              {pool.deletion
                ? "Configured capacity is not live availability."
                : "Resource tracking is not available for activation."}
            </p>
          )}
          {pool.deletion ? (
            <>
              {pool.deletion.allowed ? <p>{pool.deletion.message}</p> : null}
              {pool.deletion.archiveBlock ? (
                <p>{pool.deletion.archiveBlock.message}</p>
              ) : null}
              {pool.deletion.dependencies.length ? (
                <details>
                  <summary>View reference details</summary>
                  <ul>
                    {pool.deletion.dependencies.map((dependency) => (
                      <li key={dependency.code}>
                        {dependency.count} {dependency.label}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </>
          ) : null}
        </EntityCard>
      ))}
    </EntityGrid>
  );
}
export function ServiceRequirementsGrid({
  data,
  items,
  disabled,
  onEdit,
  onRemove,
}: {
  data: ResourceConfiguration;
  items: ResourceConfiguration["requirements"];
  disabled: boolean;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <EntityGrid label="Service resource requirements">
      {items.map((item) => {
        const name = resourceServiceName(data, item.service_id),
          pool = data.pools.find((pool) => pool.id === item.pool_id),
          serviceAvailable = data.services.some(
            (service) => service.id === item.service_id,
          );
        return (
          <EntityCard
            key={item.service_id}
            title={name}
            badges={
              <Badge
                variant={
                  pool && !pool.archived_at && serviceAvailable
                    ? "info"
                    : "warning"
                }
              >
                {pool?.archived_at
                  ? "Archived pool"
                  : pool && serviceAvailable
                    ? "Assigned"
                    : "Assignment unavailable"}
              </Badge>
            }
            footer={
              <div className="location-icon-actions">
                <EntityIconAction
                  label={`Edit requirement for ${name}`}
                  disabled={disabled || !serviceAvailable}
                  onClick={() => onEdit(item.service_id)}
                >
                  <IconEdit aria-hidden="true" />
                </EntityIconAction>
                <EntityIconAction
                  label={`Remove requirement for ${name}`}
                  disabled={disabled}
                  onClick={() => onRemove(item.service_id)}
                >
                  <IconTrash aria-hidden="true" />
                </EntityIconAction>
              </div>
            }
          >
            <p className="ops-muted">
              Pool: {pool?.name || "Unavailable pool"}
            </p>
            <p className="ops-muted">
              {resourceUnits(item.units_required)} required per service
            </p>
            {pool ? (
              <p className="ops-muted">
                {resourceUnits(pool.capacity)} configured in this pool
              </p>
            ) : null}
          </EntityCard>
        );
      })}
    </EntityGrid>
  );
}
