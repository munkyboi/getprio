import type { PublicVendorService } from "@shared";

type UnitService = Pick<PublicVendorService, "allowBookingQuantity" | "bookingQuantityMin" | "bookingQuantityMax" | "durationMinutes">;
export function durationUnitBounds(service: UnitService | null | undefined) {
  if (!service?.allowBookingQuantity) return { min: 1, max: 1 };
  const durationMaximum = service.durationMinutes > 0 ? Math.floor(1440 / service.durationMinutes) : 24;
  return { min: service.bookingQuantityMin ?? 1, max: Math.min(service.bookingQuantityMax ?? 24, durationMaximum) };
}
export function clampDurationUnits(value: number, bounds: { min: number; max: number }) {
  return Math.max(bounds.min, Math.min(Number.isFinite(value) ? Math.round(value) : bounds.min, bounds.max));
}
export function sharedDurationUnitBounds(services: UnitService[], executionMode: string) {
  if (executionMode !== "parallel" || services.length < 2 || !services.every(service => service.allowBookingQuantity && service.durationMinutes === services[0].durationMinutes)) return null;
  const min = Math.max(...services.map(service => durationUnitBounds(service).min));
  const max = Math.min(...services.map(service => durationUnitBounds(service).max));
  return min <= max ? { min, max } : null;
}

export function quantityInputChanges(value: Pick<PublicVendorService, "bookingQuantityLabel">, enabled: boolean) {
  return enabled
    ? { allowBookingQuantity: true, bookingQuantityLabel: value.bookingQuantityLabel || "Units" }
    : { allowBookingQuantity: false, bookingQuantityMin: 1, bookingQuantityMax: 24 };
}
