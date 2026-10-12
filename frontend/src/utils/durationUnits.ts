import type { PublicVendorService } from "@shared";

type UnitService = Pick<PublicVendorService, "allowBookingQuantity" | "bookingQuantityMin" | "bookingQuantityMax" | "durationMinutes">;
export function durationUnitBounds(service: UnitService | null | undefined) {
  if (!service?.allowBookingQuantity) return { min: 1, max: 1 };
  return { min: service.bookingQuantityMin ?? 1, max: service.bookingQuantityMax ?? 24 };
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
