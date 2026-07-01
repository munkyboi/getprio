import { apiRequest } from "./client";
import type {
  BookingSlotsResponse,
  CancelCustomerBookingResponse,
  CreateCustomerBookingRequest,
  CustomerBookingDetailResponse,
  CustomerBookingResponse,
  PublicVendorProfileResponse
} from "@shared";

export const bookingApi = {
  getVendorProfile(tenantSlug: string) {
    return apiRequest<PublicVendorProfileResponse>(`/public/vendors/${tenantSlug}`);
  },
  getBookingSlots(token: string | undefined, path: string) {
    return apiRequest<BookingSlotsResponse>(path, token ? { token } : {});
  },
  createCustomerBooking(token: string, body: CreateCustomerBookingRequest) {
    return apiRequest<CustomerBookingResponse, CreateCustomerBookingRequest>("/account/bookings", {
      method: "POST",
      token,
      body
    });
  },
  getCustomerBookingDetail(token: string, bookingId: string) {
    return apiRequest<CustomerBookingDetailResponse>(`/account/bookings/${bookingId}`, { token });
  },
  cancelCustomerBooking(token: string, bookingId: string, body: { reason?: string }) {
    return apiRequest<CancelCustomerBookingResponse, { reason?: string }>(
      `/account/bookings/${bookingId}/cancel`,
      { method: "POST", token, body }
    );
  }
};
