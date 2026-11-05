import type {
  SaveVendorServiceRequest,
  SaveVendorAvailabilityExceptionRequest,
} from "@shared";

export function serviceQuantityError(
  service: Pick<
    SaveVendorServiceRequest,
    | "allowBookingQuantity"
    | "bookingQuantityMin"
    | "bookingQuantityMax"
    | "durationMinutes"
  >,
) {
  if (!service.allowBookingQuantity) return "";
  const min = service.bookingQuantityMin ?? 1;
  const max = service.bookingQuantityMax ?? 24;
  if (
    ![min, max].every(
      (value) => Number.isInteger(value) && value >= 1 && value <= 24,
    )
  )
    return "Enter whole quantities from 1 to 24.";
  if (min > max) return "Maximum quantity must be at least the minimum.";
  if (min * service.durationMinutes > 1440)
    return "Minimum quantity needs more than 24 hours. Reduce the quantity or duration.";
  return "";
}

export function dateExceptionPayload(
  form: SaveVendorAvailabilityExceptionRequest,
  blockEntireDay: boolean,
  locationSlug: string,
): SaveVendorAvailabilityExceptionRequest {
  return {
    ...form,
    ...(blockEntireDay
      ? { startsAt: "", endsAt: "", isAvailable: false, serviceSlug: "" }
      : {}),
    locationSlug,
  };
}
