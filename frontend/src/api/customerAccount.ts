import { API_BASE_URL, apiRequest } from "./client";
import type {
  CustomerAvatarUploadResponse,
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
  OrganizerCampaign,
  PublicOrganizerCampaign,
  SubmitGroupFundedContributionProofRequest,
  UpdateGroupFundedCampaignRequest,
  UpdateCustomerNotificationSettingsRequest,
  UpdateCustomerNotificationSettingsResponse
} from "@shared";

export const customerAccountApi = {
  getCampaigns(token: string) {
    return apiRequest<{ campaigns: OrganizerCampaign[] }>("/account/campaigns", { token });
  },
  getCampaign(token: string, campaignId: string) {
    return apiRequest<{ campaign: OrganizerCampaign }>(`/account/campaigns/${encodeURIComponent(campaignId)}`, { token });
  },
  leaveCampaign(token: string, campaignId: string) {
    return apiRequest<{ left: boolean }>(
      `/account/campaigns/${encodeURIComponent(campaignId)}/contributions/self`,
      { method: "DELETE", token }
    );
  },
  createCampaign(token: string, body: { bookingId: string; title: string; description: string; deadlineAt: string; contributionFeeCents: number; requiredContributors: number; paymentInstructions: string }) {
    return apiRequest<{ campaign: OrganizerCampaign }, typeof body>("/account/campaigns", { method: "POST", token, body });
  },
  publishCampaign(token: string, campaignId: string, visibility: "private_link" | "public") {
    return apiRequest<{ campaign: OrganizerCampaign }>(`/account/campaigns/${encodeURIComponent(campaignId)}/publish`, { method: "PATCH", token, body: { visibility } });
  },
  updateCampaign(token: string, campaignId: string, body: { title: string; description: string; deadlineAt: string; contributionFeeCents: number; requiredContributors: number; paymentInstructions: string }) {
    return apiRequest<{ campaign: OrganizerCampaign }>(`/account/campaigns/${encodeURIComponent(campaignId)}`, { method: "PATCH", token, body });
  },
  unpublishCampaign(token: string, campaignId: string) {
    return apiRequest<{ campaign: OrganizerCampaign }>(`/account/campaigns/${encodeURIComponent(campaignId)}/unpublish`, { method: "PATCH", token });
  },
  getCampaignDiscovery(token: string, filters: { search?: string; date?: string } = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value?.trim()) params.set(key, value.trim()); });
    return apiRequest<{ campaigns: PublicOrganizerCampaign[] }>(`/account/campaign-discovery${params.size ? `?${params.toString()}` : ""}`, { token });
  },
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
  async uploadAvatar(token: string, file: File) {
    const response = await fetch(
      `${API_BASE_URL}/account/profile/avatar?fileName=${encodeURIComponent(file.name)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": file.type
        },
        body: file
      }
    );
    const payload = await response.json().catch(() => null) as CustomerAvatarUploadResponse | { message?: string } | null;
    if (!response.ok) {
      throw new Error(payload && "message" in payload && payload.message
        ? payload.message
        : "Profile photo upload failed.");
    }
    return payload as CustomerAvatarUploadResponse;
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
