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
      apiRequest<CustomerAccountHistoryResponse>("/account/history", { token }),
      apiRequest<CustomerBookingsResponse>("/account/bookings", { token }),
      apiRequest<{ notificationSettings: CustomerNotificationSettings }>("/account/notification-settings", { token })
    ]).then(([overview, ticketHistory, customerBookings, notificationSettingsResponse]) => ({
      overview,
      ticketHistory,
      customerBookings,
      notificationSettings: notificationSettingsResponse.notificationSettings
    }));
  },
  updateProfile(token: string, body: CustomerProfileUpdateRequest) {
    return apiRequest<CustomerProfileUpdateResponse, CustomerProfileUpdateRequest>("/account/profile", {
      method: "PATCH",
      token,
      body
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
