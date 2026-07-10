import { apiRequest } from "./client";
import type {
  CustomerAccountHistoryResponse,
  CustomerAccountOverviewResponse,
  CustomerBookingsResponse,
  CustomerNotificationSettings,
  CustomerProfileUpdateRequest,
  CustomerProfileUpdateResponse,
  PasswordChangeRequest,
  UpdateCustomerNotificationSettingsRequest,
  UpdateCustomerNotificationSettingsResponse
} from "@shared";

export const customerAccountApi = {
  getOverview(token: string) {
    return Promise.all([
      apiRequest<CustomerAccountOverviewResponse>("/account/overview", { token }),
      apiRequest<{ notificationSettings: CustomerNotificationSettings }>("/account/notification-settings", { token })
    ]).then(([overview, notificationSettingsResponse]) => ({
      overview,
      notificationSettings: notificationSettingsResponse.notificationSettings
    }));
  },
  getTickets(token: string, page: number, pageSize: number) {
    return apiRequest<CustomerAccountHistoryResponse>(
      `/account/history?page=${page}&pageSize=${pageSize}`,
      { token }
    );
  },
  getBookings(
    token: string,
    page: number,
    pageSize: number,
    filters?: {
      search?: string;
      status?: string;
      scheduledDateFrom?: string;
      scheduledDateTo?: string;
    }
  ) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize)
    });

    if (filters?.search?.trim()) {
      params.set("search", filters.search.trim());
    }

    if (filters?.status && filters.status !== "all") {
      params.set("status", filters.status);
    }

    if (filters?.scheduledDateFrom) {
      params.set("scheduledDateFrom", filters.scheduledDateFrom);
    }

    if (filters?.scheduledDateTo) {
      params.set("scheduledDateTo", filters.scheduledDateTo);
    }

    return apiRequest<CustomerBookingsResponse>(
      `/account/bookings?${params.toString()}`,
      { token }
    );
  },
  updateProfile(token: string, body: CustomerProfileUpdateRequest) {
    return apiRequest<CustomerProfileUpdateResponse, CustomerProfileUpdateRequest>("/account/profile", {
      method: "PATCH",
      token,
      body
    });
  },
  claimTicket(token: string, lookupCode: string) {
    return apiRequest<{ success: boolean }>(`/account/tickets/${encodeURIComponent(lookupCode)}/claim`, {
      method: "POST",
      token
    });
  },
  changePassword(token: string, body: PasswordChangeRequest) {
    return apiRequest<void, PasswordChangeRequest>("/account/change-password", {
      method: "POST",
      token,
      body
    });
  },
  updateNotificationSettings(token: string, body: UpdateCustomerNotificationSettingsRequest) {
    return apiRequest<UpdateCustomerNotificationSettingsResponse, UpdateCustomerNotificationSettingsRequest>(
      "/account/notification-settings",
      { method: "PATCH", token, body }
    );
  }
};
