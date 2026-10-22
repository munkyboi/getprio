import { useQueries } from "@tanstack/react-query";
import { IconEdit } from "@tabler/icons-react";
import { getQueueServiceConfiguration } from "../api/queueServiceConfigurationV4";
import { EntityCard, EntityGrid, EntityIconAction } from "./EntityCards";
import { ManagedCollection } from "./ManagedCollection";
import { Badge } from "./components/ui/badge";

export interface QueuePolicyService {
  id: string;
  name: string;
  isActive: boolean;
  slug?: string;
}
function PolicyCards({
  items,
  token,
  tenant,
  location,
  canManage,
  busy,
  onEdit,
}: {
  items: QueuePolicyService[];
  token: string;
  tenant: string;
  location: string;
  canManage: boolean;
  busy: boolean;
  onEdit: (id: string) => void;
}) {
  const policies = useQueries({
    queries: items.map((service) => ({
      queryKey: [
        "queue-service-configuration",
        token,
        tenant,
        location,
        service.id,
      ],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getQueueServiceConfiguration(
          token,
          tenant,
          location,
          service.id,
          signal,
        ),
      enabled: canManage,
      retry: false,
      staleTime: 30_000,
    })),
  });
  return (
    <EntityGrid label="Queue policies">
      {items.map((service, index) => {
        const query = policies[index],
          configuration = query.data?.policy?.configuration;
        return (
          <EntityCard
            key={service.id}
            title={service.name}
            badges={
              <Badge variant={service.isActive ? "success" : "secondary"}>
                {service.isActive ? "Active" : "Inactive"}
              </Badge>
            }
            footer={
              <EntityIconAction
                label={`Edit ${service.name} queue policy`}
                disabled={!canManage || busy}
                onClick={() => onEdit(service.id)}
              >
                <IconEdit aria-hidden="true" />
              </EntityIconAction>
            }
          >
            <p className="ops-muted">
              {service.slug ? `/${service.slug}` : "Service queue settings"} ·
              Catalog service {service.isActive ? "active" : "inactive"}
            </p>
            {!canManage ? (
              <p>Service management permission is required.</p>
            ) : query.isPending ? (
              <p role="status">Loading policy…</p>
            ) : query.isError ? (
              <p role="alert">
                Policy could not be loaded. Open the editor to retry.
              </p>
            ) : configuration ? (
              <dl className="config-catalog-summary">
                <div>
                  <dt>Assignment</dt>
                  <dd>
                    {configuration.assignment.mode === "named"
                      ? "Named resources"
                      : "Automatic pooled capacity"}
                  </dd>
                </div>
                <div>
                  <dt>Default duration</dt>
                  <dd>
                    {configuration.duration.defaultCount} ×{" "}
                    {configuration.duration.baseMinutes} ={" "}
                    {configuration.duration.defaultCount *
                      configuration.duration.baseMinutes}{" "}
                    minutes
                  </dd>
                </div>
                <div>
                  <dt>Duration policy</dt>
                  <dd>
                    {configuration.duration.mode === "fixed"
                      ? "Fixed"
                      : "Adjustable"}{" "}
                    ·{" "}
                    {configuration.duration.visible
                      ? "Visible in intake"
                      : "Hidden in intake"}
                  </dd>
                </div>
                <div>
                  <dt>Count range</dt>
                  <dd>
                    {configuration.duration.minCount}–
                    {configuration.duration.maxCount} · Step{" "}
                    {configuration.duration.stepCount}
                  </dd>
                </div>
              </dl>
            ) : (
              <p>
                Not configured. Open the editor to enter an explicit queue
                policy.
              </p>
            )}
          </EntityCard>
        );
      })}
    </EntityGrid>
  );
}
export function QueuePoliciesGrid(props: {
  services: QueuePolicyService[];
  token: string;
  tenant: string;
  location: string;
  canManage: boolean;
  busy: boolean;
  onEdit: (id: string) => void;
}) {
  return (
    <ManagedCollection
      items={props.services}
      label="queue policies"
      defaultStatus="active"
      statusTabs
      statuses={[
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
      ]}
      statusOf={(service) => (service.isActive ? "active" : "inactive")}
      searchText={(service) => `${service.name} ${service.slug || ""}`}
    >
      {(items) => <PolicyCards {...props} items={items} />}
    </ManagedCollection>
  );
}
