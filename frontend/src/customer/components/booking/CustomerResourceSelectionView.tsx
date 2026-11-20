import { FieldSet, FieldLegend } from "../shadcn/field";
import type { BookingSelectionPresentationModel } from "../../../components/BookingSelectionEditorV4";
import type { BookingCatalogServiceV4 } from "@shared/bookingSelectionV4";
import { useContext, useRef, useState } from "react";
import { Check as IconCheck, Info as IconInfoCircle, Plus as IconPlus } from "lucide-react";
import { Checkbox } from "../shadcn/checkbox";
import { Alert, Button, Card } from "../ui";
import { ResponsiveDrawer } from "../vendor/ResponsiveDrawer";
import { CustomerBookingServiceDetailsContext, findCustomerBookingServiceDetails } from "./CustomerBookingServiceDetailsContext";
function BookingServiceThumbnail({ imageUrl, name }: { imageUrl?: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const focusInfo = () => window.requestAnimationFrame(() => {
    container.current?.closest(".booking-service-main")?.querySelector<HTMLButtonElement>(".booking-service-actions [data-slot=sheet-trigger]")?.focus();
  });
  return <div ref={container} className="booking-service-thumbnail">
    {imageUrl && (!failed || open) ? <ResponsiveDrawer title={`View ${name} image`} triggerVariant="ghost" open={open} onOpenChange={next => { setOpen(next); if (!next && failed) focusInfo(); }} trigger={<img src={imageUrl} alt="" onError={event => { const focused = document.activeElement === event.currentTarget.closest("button"); setFailed(true); if (!open && focused) focusInfo(); }} />}>
      <img className="customer-service-expanded-image" src={imageUrl} alt={name} onError={event => { if (event.currentTarget.getAttribute("src") !== "/logo.svg") event.currentTarget.src = "/logo.svg"; event.currentTarget.alt = "Image unavailable"; }} />
    </ResponsiveDrawer> : <img src="/logo.svg" alt="" />}
  </div>;
}
function Choice({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="customer-resource-choice">
      <Checkbox checked={checked} disabled={disabled} onCheckedChange={onChange} />
      <span className="customer-resource-choice-label">{label}</span>
    </label>
  );
}
function Count({
  label,
  value,
  min,
  max,
  step = 1,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <div className="booking-service-units"><span>{label}</span><div className="booking-unit-counter">
      <Button variant="ghost" size="icon" aria-label={`Decrease ${label}`} disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value-step))}>−</Button>
      <output aria-label={label}>{value}</output>
      <Button variant="ghost" size="icon" aria-label={`Increase ${label}`} disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value+step))}>+</Button>
    </div></div>
  );
}
export function CustomerResourceSelectionView({
  model: m,
}: {
  model: BookingSelectionPresentationModel;
}) {
  const publicServices = useContext(CustomerBookingServiceDetailsContext);
  const duration = (
    s: BookingCatalogServiceV4,
    v: number,
    change: (n: number) => void,
    label = "Duration count",
  ) => s.duration.minCount === 1 && s.duration.maxCount === 1 ? null : (
    <div className="customer-resource-duration">
        <Count
          label={label}
          value={v}
          min={s.duration.minCount}
          max={s.duration.maxCount}
          step={s.duration.stepCount}
          disabled={m.disabled}
          onChange={change}
        />
      <small>
        {s.duration.baseMinutes * v} minutes total
        {s.duration.minCount !== 1 || s.duration.maxCount !== 1
          ? ` (${s.duration.baseMinutes} minutes per count)`
          : null}
      </small>
    </div>
  );
  return (
    <div className="customer-page-stack">
      {m.catalog.reasonCode === "BOOKING_WORKFLOW_UNSUPPORTED" ? (
        <Alert data-intent="warning">
          These services need a supported booking workflow. Please contact the
          vendor to arrange your visit.
        </Alert>
      ) : null}
      {m.catalog.blockedServices?.map((s) => (
        <Alert data-intent="warning" key={s.id}>
          {s.name} needs resource and duration setup. Please contact the vendor.
        </Alert>
      ))}

      {m.catalog.services.map((s) => {
        const root = m.value.find((v) => v.serviceId === s.id);
        const details = findCustomerBookingServiceDetails(publicServices, s.slug);
        return (
          <Card className="booking-service-card booking-ordinary-service customer-resource-card" data-selected={Boolean(root)} key={s.id}>
            <div className="booking-service-main">
              <BookingServiceThumbnail key={details?.imageUrl || "fallback"} imageUrl={details?.imageUrl} name={s.name} />
              <div className="booking-service-copy">
                <strong>{s.name}</strong>
                <p>
                  {s.duration.visible && s.duration.baseMinutes > 0 ? `${s.duration.baseMinutes} min · ` : ""}
                  {details?.priceDisplay || "Price confirmed by vendor"}
                </p>
              </div>
              <div className="booking-service-actions">
                <ResponsiveDrawer title={`About ${s.name}`} triggerVariant="ghost" trigger={<><IconInfoCircle /><span className="customer-sr-only">About {s.name}</span></>}>
                  <p>{details?.description || "Ask the vendor for service details."}</p>
                </ResponsiveDrawer>
                <Button type="button" variant="ghost" size="icon" disabled={m.disabled || !s.resourceReady} aria-label={`${root ? "Remove" : "Select"} ${s.name}`} aria-pressed={Boolean(root)} onClick={() => m.toggleService(s, !root)}>
                  {root ? <IconCheck /> : <IconPlus />}
                </Button>
              </div>
            </div>
            {!s.resourceReady ? (
              <p>
                This service needs resource setup. Please contact the vendor.
              </p>
            ) : null}
            {root && s.assignment === "named" ? (
              <FieldSet className="customer-resource-members">
                <FieldLegend>Choose resources</FieldLegend>
                {s.resources
                  .filter((r) => r.enabled)
                  .map((r) => (
                    <Choice
                      key={r.id}
                      label={r.name}
                      checked={root.resources.some(
                        (v) => v.resourceMemberId === r.id,
                      )}
                      disabled={m.disabled}
                      onChange={(checked) =>
                        m.selectMembers(
                          s,
                          checked
                            ? [
                                ...root.resources.map(
                                  (v) => v.resourceMemberId!,
                                ),
                                r.id,
                              ]
                            : root.resources
                                .map((v) => v.resourceMemberId!)
                                .filter((id) => id !== r.id),
                        )
                      }
                    />
                  ))}
              </FieldSet>
            ) : null}
            {root?.resources.map((resource) => (
              <div
                key={resource.resourceSelectionId}
                className="customer-resource-leaf"
              >
                {s.assignment === "named" ? <h3>
                  {s.resources.find((r) => r.id === resource.resourceMemberId)
                    ?.name || s.name}
                </h3> : null}
                <div className="customer-resource-controls">
                  {s.assignment === "automatic" ? (
                    <Count
                      label="Quantity"
                      value={resource.quantity}
                      min={1}
                      max={s.quantityMax}
                      disabled={m.disabled}
                      onChange={(n) =>
                        m.updateResource(s.id, resource.resourceSelectionId, {
                          ...resource,
                          quantity: n,
                        })
                      }
                    />
                  ) : null}
                  {duration(s, resource.durationCount, (n) =>
                    m.updateResource(s.id, resource.resourceSelectionId, {
                      ...resource,
                      durationCount: n,
                    }),
                  )}
                </div>
                {s.extras.map((option) => {
                  const extra = m.catalog.services.find(
                    (v) => v.id === option.serviceId,
                  );
                  if (!extra)
                    return (
                      <Alert key={option.serviceId} data-intent="warning">
                        An extra needs vendor setup.
                      </Alert>
                    );
                  const selected = resource.extras.find(
                    (v) => v.serviceId === extra.id,
                  );
                  return (
                    <div key={extra.id} className="customer-resource-extra">
                      <Choice
                        label={`${extra.name}${option.required ? " (required)" : ""}`}
                        checked={!!selected}
                        disabled={m.disabled || !extra.resourceReady}
                        onChange={(v) =>
                          m.toggleExtra(s.id, resource, extra, v)
                        }
                      />
                      {selected ? (
                        <>
                          {extra.assignment === "named" ? (
                            <FieldSet>
                              <FieldLegend>{extra.name} resources</FieldLegend>
                              {extra.resources
                                .filter((r) => r.enabled)
                                .map((r) => (
                                  <Choice
                                    key={r.id}
                                    label={r.name}
                                    checked={
                                      selected.resourceMemberIds?.includes(
                                        r.id,
                                      ) || false
                                    }
                                    disabled={m.disabled}
                                    onChange={(checked) => {
                                      const ids = checked
                                        ? [
                                            ...(selected.resourceMemberIds ||
                                              []),
                                            r.id,
                                          ]
                                        : (
                                            selected.resourceMemberIds || []
                                          ).filter((id) => id !== r.id);
                                      m.updateExtra(s.id, resource, {
                                        ...selected,
                                        quantity: ids.length,
                                        resourceMemberIds: ids,
                                      });
                                    }}
                                  />
                                ))}
                            </FieldSet>
                          ) : null}
                          <div className="customer-resource-controls">
                            {extra.assignment !== "named" ? (
                              <Count
                                label={`${extra.name} quantity`}
                                value={selected.quantity}
                                min={1}
                                max={extra.quantityMax}
                                disabled={m.disabled}
                                onChange={(n) =>
                                  m.updateExtra(s.id, resource, {
                                    ...selected,
                                    quantity: n,
                                  })
                                }
                              />
                            ) : null}
                            {duration(
                              extra,
                              selected.durationCount,
                              (n) =>
                                m.updateExtra(s.id, resource, {
                                  ...selected,
                                  durationCount: n,
                                }),
                              `${extra.name} duration count`,
                            )}
                          </div>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </Card>
        );
      })}
      <p>
        Amount confirmed by vendor. Required payment proof is still checked
        before confirmation.
      </p>
    </div>
  );
}
