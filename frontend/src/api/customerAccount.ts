import { apiRequest } from "./client";
import type {
  CustomerAccountHistoryResponse,
  CustomerAccountOverviewResponse,
  CustomerBookingsResponse,
  CreateGroupFundedCampaignRequest,
  GroupFundedCampaignResponse,
  GroupFundedCampaignsResponse,
  CustomerNotificationSettings,
  CustomerProfileUpdateRequest,
  CustomerProfileUpdateResponse,
  PasswordChangeRequest,
  SubmitGroupFundedContributionProofRequest,
  UpdateGroupFundedCampaignRequest,
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
  getGroupFundedCampaigns(token: string) {
    return apiRequest<GroupFundedCampaignsResponse>("/account/group-funded-campaigns", { token });
  },
  createGroupFundedCampaign(token: string, body: CreateGroupFundedCampaignRequest) {
    return apiRequest<GroupFundedCampaignResponse, CreateGroupFundedCampaignRequest>("/account/group-funded-campaigns", {
      method: "POST",
      token,
      body
    });
  },
  getGroupFundedCampaignSelf(token: string, campaignIdOrToken: string) {
    return apiRequest<GroupFundedCampaignResponse>(
      `/account/group-funded-campaigns/${encodeURIComponent(campaignIdOrToken)}/self`,
      { token }
    );
  },
  submitGroupFundedContributionProof(
    token: string,
    campaignIdOrToken: string,
    body: SubmitGroupFundedContributionProofRequest
  ) {
    return apiRequest<GroupFundedCampaignResponse, SubmitGroupFundedContributionProofRequest>(
      `/account/group-funded-campaigns/${encodeURIComponent(campaignIdOrToken)}/contributions/payment-proof`,
      { method: "POST", token, body }
    );
  },
  cancelGroupFundedCampaign(token: string, campaignIdOrToken: string, body: { reason?: string }) {
    return apiRequest<GroupFundedCampaignResponse, { reason?: string }>(
      `/account/group-funded-campaigns/${encodeURIComponent(campaignIdOrToken)}/cancel`,
      { method: "PATCH", token, body }
    );
  },
  updateGroupFundedCampaign(token: string, campaignIdOrToken: string, body: UpdateGroupFundedCampaignRequest) {
    return apiRequest<GroupFundedCampaignResponse, UpdateGroupFundedCampaignRequest>(
      `/account/group-funded-campaigns/${encodeURIComponent(campaignIdOrToken)}/details`,
      { method: "PATCH", token, body }
    );
  },
  acceptGroupFundedReplacementSlot(token: string, campaignIdOrToken: string) {
    return apiRequest<GroupFundedCampaignResponse>(
      `/account/group-funded-campaigns/${encodeURIComponent(campaignIdOrToken)}/replacement-slot/accept`,
      { method: "PATCH", token }
    );
  },
  declineGroupFundedReplacementSlot(token: string, campaignIdOrToken: string, body: { reason?: string }) {
    return apiRequest<GroupFundedCampaignResponse, { reason?: string }>(
      `/account/group-funded-campaigns/${encodeURIComponent(campaignIdOrToken)}/replacement-slot/decline`,
      { method: "PATCH", token, body }
    );
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
