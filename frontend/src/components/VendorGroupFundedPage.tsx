import {
  Alert, Badge, Box, Button, Card, Checkbox, Group, Image, Modal, Paper, Select, SimpleGrid, Spoiler, Stack, Table, Text, Textarea, Title
} from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import type { Dispatch, SetStateAction } from "react";
import type {
  GroupFundedBundleItemSummary, GroupFundedCampaignSummary, GroupFundedRefundStatus,
  VendorGroupFundedCampaignDetailResponse, VendorGroupFundedContributionSummary, VendorGroupFundedRefundSummary
} from "@shared";
import * as vendorDashboardBookings from "../api/vendorDashboardBookings";
import CampaignFundingProgress from "../components/CampaignFundingProgress";
import RichCampaignDescription from "../components/RichCampaignDescription";
import { formatDateTime, formatBookingScheduleDateTime, formatBookingScheduleTimeRange } from "../utils/dates";

type RawGroupFundedBundleItem = GroupFundedBundleItemSummary & { _id?: string | null; serviceNameSnapshot?: string; serviceSlugSnapshot?: string };
type GroupFundedStatusFilter = "all" | "funding" | "vendor_review" | "slot_recovery" | "replacement_proposed" | "confirmed" | "vendor_rejected" | "funding_failed";
type GroupFundedCampaignsQuery = { data?: Awaited<ReturnType<typeof vendorDashboardBookings.getGroupFundedCampaigns>>; isFetching: boolean };
type GroupFundedDetailQuery = { data?: VendorGroupFundedCampaignDetailResponse; isFetching: boolean };

function formatBytes(sizeBytes: number | null): string {
  if (!sizeBytes) return "Unknown size";
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MetricCard({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <Card className="neura-card" padding="lg">
      <Stack gap={18}>
        <Text className="neura-label">{label}</Text>
        <Title order={2}>{value}</Title>
        <Text className="neura-muted">{detail}</Text>
      </Stack>
    </Card>
  );
}

function DashboardEmptyState({ title, text }: { title: string; text: string }) {
  return (
    <Stack className="neura-empty-state" gap="sm">
      <img alt="" className="neura-empty-art" src="/illustrations/generated/dashboard-empty.png" />
      <Text fw={800}>{title}</Text>
      <Text className="neura-muted">{text}</Text>
    </Stack>
  );
}

function formatMoney(amountCents: number, currency = "PHP"): string {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency, minimumFractionDigits: 2 }).format(Number(amountCents || 0) / 100);
}
function getCampaignFundingTargetAmountCents(campaign: { targetAmountCents?: number; roundingAdjustmentCents?: number }): number {
  return Number(campaign.targetAmountCents || 0) + Number(campaign.roundingAdjustmentCents || 0);
}
function getGroupFundedStatusColor(status: string) {
  if (status === "confirmed") return "teal";
  if (["vendor_review", "slot_recovery", "replacement_proposed", "funded"].includes(status)) return "blue";
  if (status === "funding") return "yellow";
  if (["vendor_rejected", "funding_failed", "vendor_review_expired", "organizer_canceled", "vendor_canceled"].includes(status)) return "red";
  return "gray";
}
function getGroupFundedRefundStatusColor(status: GroupFundedRefundStatus) {
  if (status === "completed") return "teal";
  if (status === "in_progress") return "blue";
  if (status === "policy_review_required") return "orange";
  return "red";
}

export type VendorGroupFundedPageProps = {
  busyAction: string; canAdminBookings: boolean; closeGroupFundedContributionRejectModal: () => void;
  groupFundedCampaignRejectionReasons: Array<{ label: string; value: string; reason: string }>; groupFundedCampaignsQuery: GroupFundedCampaignsQuery;
  groupFundedContributionRefundRequired: boolean; groupFundedContributionRejectReason: string; groupFundedContributionRejectReasonPreset: string | null;
  groupFundedContributionRejectionReasons: Array<{ label: string; value: string; reason: string }>; groupFundedContributionToReject: VendorGroupFundedContributionSummary | null; groupFundedContributionUseCustomRejectReason: boolean;
  groupFundedDetailId: string | null; groupFundedDetailQuery: GroupFundedDetailQuery; groupFundedProofAccessUrl: string | null; groupFundedProofContribution: VendorGroupFundedContributionSummary | null; groupFundedProofError: string; groupFundedProofModalOpen: boolean;
  groupFundedRefundNotes: Record<string, string>; groupFundedRejectReason: string; groupFundedRejectReasonPreset: string | null; groupFundedStatusFilter: GroupFundedStatusFilter; groupFundedUseCustomRejectReason: boolean;
  handleApproveGroupFundedCampaign: (campaign: GroupFundedCampaignSummary) => Promise<void>; handleRejectGroupFundedCampaign: (campaign: GroupFundedCampaignSummary) => Promise<void>; handleRejectGroupFundedContribution: () => Promise<void>;
  handleUpdateGroupFundedRefund: (refund: VendorGroupFundedRefundSummary, status: Extract<GroupFundedRefundStatus, "in_progress" | "completed" | "policy_review_required">) => Promise<void>;
  handleVerifyGroupFundedContribution: (contribution: VendorGroupFundedContributionSummary) => Promise<void>; handleViewGroupFundedContributionProof: (contribution: VendorGroupFundedContributionSummary) => Promise<void>;
  isGroupFundedCampaignFullyRefunded: (campaign: GroupFundedCampaignSummary) => boolean; openGroupFundedContributionRejectModal: (contribution: VendorGroupFundedContributionSummary) => void; reloadGroupFundedCampaigns: () => Promise<void>; resetGroupFundedCampaignDecision: () => void;
  setGroupFundedContributionRefundRequired: (value: boolean) => void; setGroupFundedContributionRejectReason: (value: string) => void; setGroupFundedContributionRejectReasonPreset: (value: string | null) => void; setGroupFundedContributionUseCustomRejectReason: (value: boolean) => void;
  setGroupFundedDetailId: (value: string | null) => void; setGroupFundedProofModalOpen: (value: boolean) => void; setGroupFundedRefundNotes: Dispatch<SetStateAction<Record<string, string>>>; setGroupFundedRejectReason: (value: string) => void; setGroupFundedRejectReasonPreset: (value: string | null) => void; setGroupFundedStatusFilter: (value: GroupFundedStatusFilter) => void; setGroupFundedUseCustomRejectReason: (value: boolean) => void;
};

export default function VendorGroupFundedPage(props: VendorGroupFundedPageProps) {
  const { busyAction, canAdminBookings, closeGroupFundedContributionRejectModal, groupFundedCampaignRejectionReasons, groupFundedCampaignsQuery, groupFundedContributionRefundRequired, groupFundedContributionRejectReason, groupFundedContributionRejectReasonPreset, groupFundedContributionRejectionReasons, groupFundedContributionToReject, groupFundedContributionUseCustomRejectReason, groupFundedDetailId, groupFundedDetailQuery, groupFundedProofAccessUrl, groupFundedProofContribution, groupFundedProofError, groupFundedProofModalOpen, groupFundedRefundNotes, groupFundedRejectReason, groupFundedRejectReasonPreset, groupFundedStatusFilter, groupFundedUseCustomRejectReason, handleApproveGroupFundedCampaign, handleRejectGroupFundedCampaign, handleRejectGroupFundedContribution, handleUpdateGroupFundedRefund, handleVerifyGroupFundedContribution, handleViewGroupFundedContributionProof, isGroupFundedCampaignFullyRefunded, openGroupFundedContributionRejectModal, reloadGroupFundedCampaigns, resetGroupFundedCampaignDecision, setGroupFundedContributionRefundRequired, setGroupFundedContributionRejectReason, setGroupFundedContributionRejectReasonPreset, setGroupFundedContributionUseCustomRejectReason, setGroupFundedDetailId, setGroupFundedProofModalOpen, setGroupFundedRefundNotes, setGroupFundedRejectReason, setGroupFundedRejectReasonPreset, setGroupFundedStatusFilter, setGroupFundedUseCustomRejectReason } = props;
    const campaigns = groupFundedCampaignsQuery.data?.campaigns || [];
    const reviewReadyCount = campaigns.filter((campaign) => campaign.campaignStatus === "vendor_review").length;
    const proofReviewCount = campaigns.filter((campaign) =>
      ["funding", "funded", "vendor_review"].includes(campaign.campaignStatus)
    ).length;
    const selectedDetail = groupFundedDetailQuery.data || null;
    const selectedDetailBundleItems = selectedDetail
      ? (
          selectedDetail.campaign.bundleItems?.length
            ? selectedDetail.campaign.bundleItems.map((item) => {
                const rawItem = item as RawGroupFundedBundleItem;
                return {
                  id: rawItem.id || rawItem._id || null,
                  serviceId: rawItem.serviceId,
                  serviceName: rawItem.serviceName || rawItem.serviceNameSnapshot || selectedDetail.campaign.serviceName,
                  serviceSlug: rawItem.serviceSlug || rawItem.serviceSlugSnapshot || "",
                  bookingQuantity: rawItem.bookingQuantity,
                  priceAmountCents: rawItem.priceAmountCents,
                  currency: rawItem.currency,
                  executionMode: rawItem.executionMode,
                  scheduledStartAt: rawItem.scheduledStartAt,
                  scheduledEndAt: rawItem.scheduledEndAt,
                  sortOrder: rawItem.sortOrder
                };
              })
            : [{
                id: null,
                serviceId: selectedDetail.campaign.serviceId,
                serviceName: selectedDetail.campaign.serviceName,
                serviceSlug: selectedDetail.campaign.serviceSlug,
                bookingQuantity: selectedDetail.campaign.bookingQuantity,
                priceAmountCents: getCampaignFundingTargetAmountCents(selectedDetail.campaign),
                currency: selectedDetail.campaign.currency,
                executionMode: "parallel" as const,
                scheduledStartAt: selectedDetail.campaign.scheduledStartAt,
                scheduledEndAt: selectedDetail.campaign.scheduledEndAt,
                sortOrder: 0
              }]
        )
      : [];
    const selectedDetailHasServiceBundle = selectedDetailBundleItems.length > 1;
    const selectedDetailFundingTargetAmountCents = selectedDetail
      ? getCampaignFundingTargetAmountCents(selectedDetail.campaign)
      : 0;
    const submittedContributions = selectedDetail?.contributions.filter(
      (contribution) => contribution.contributionStatus === "submitted"
    ) || [];
    const verifiedContributions = selectedDetail?.contributions.filter(
      (contribution) => contribution.contributionStatus === "verified"
    ) || [];
    const activeCapacityHold = selectedDetail?.capacityHolds.find((hold) => hold.holdStatus === "active") || null;
    const selectedDetailFundingReached = Boolean(
      selectedDetail &&
      (
        selectedDetail.campaign.fundedAmountCents >= selectedDetailFundingTargetAmountCents ||
        selectedDetail.campaign.paidParticipantCount >= selectedDetail.campaign.requiredContributors ||
        selectedDetail.campaign.campaignStatus !== "funding"
      )
    );

    return (
      <Stack gap="lg">
        <SimpleGrid cols={{ base: 1, md: 3 }}>
          <MetricCard
            detail="Campaigns matching the current branch and filter."
            label="Campaigns"
            value={campaigns.length}
          />
          <MetricCard
            detail="Campaigns with submitted or active funding work."
            label="Funding work"
            value={proofReviewCount}
          />
          <MetricCard
            detail="Fully funded campaigns waiting for a vendor decision."
            label="Vendor review"
            value={reviewReadyCount}
          />
        </SimpleGrid>

        <Card className="neura-card" padding="lg">
          <Stack gap="md">
            <Group align="flex-end" justify="space-between">
              <div>
                <Text className="neura-label">Vendor operations</Text>
                <Title order={3}>Group-funded campaigns</Title>
                <Text c="dimmed" size="sm">
                  Review contribution proofs, funding progress, capacity holds, and approval decisions.
                </Text>
              </div>
              <Group gap="sm">
                <Select
                  data={[
                    { label: "All statuses", value: "all" },
                    { label: "Funding", value: "funding" },
                    { label: "Vendor review", value: "vendor_review" },
                    { label: "Slot recovery", value: "slot_recovery" },
                    { label: "Replacement proposed", value: "replacement_proposed" },
                    { label: "Confirmed", value: "confirmed" },
                    { label: "Vendor rejected", value: "vendor_rejected" },
                    { label: "Funding failed", value: "funding_failed" }
                  ]}
                  label="Status"
                  value={groupFundedStatusFilter}
                  onChange={(value) => setGroupFundedStatusFilter((value || "all") as GroupFundedStatusFilter)}
                />
                <Button className="neura-secondary-button" mt={24} onClick={reloadGroupFundedCampaigns}>
                  Refresh
                </Button>
              </Group>
            </Group>

            {groupFundedCampaignsQuery.isFetching ? (
              <Text c="dimmed" size="sm">Loading group-funded campaigns...</Text>
            ) : null}

            {campaigns.length ? (
              <Table.ScrollContainer minWidth={1160}>
                <Table className="neura-bookings-table" verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th className="neura-bookings-table__sticky neura-bookings-table__sticky-first" style={{ width: 84 }}>
                        ID
                      </Table.Th>
                      <Table.Th>Campaign</Table.Th>
                      <Table.Th>Service</Table.Th>
                      <Table.Th>Schedule</Table.Th>
                      <Table.Th>Funding</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {campaigns.map((campaign) => {
                      const fundingTargetAmountCents = getCampaignFundingTargetAmountCents(campaign);
                      return (
                        <Table.Tr key={campaign.id}>
                          <Table.Td
                            className="neura-bookings-table__sticky neura-bookings-table__sticky-first"
                            fw={700}
                            style={{ width: 84 }}
                          >
                            #{campaign.id}
                          </Table.Td>
                          <Table.Td>
                            <Stack gap={2}>
                              <Button
                                className="neura-inline-link-button"
                                onClick={() => {
                                  resetGroupFundedCampaignDecision();
                                  closeGroupFundedContributionRejectModal();
                                  setGroupFundedRefundNotes({});
                                  setGroupFundedDetailId(campaign.id);
                                }}
                                p={0}
                                size="xs"
                                variant="subtle"
                              >
                                {campaign.campaignTitle || campaign.serviceName}
                              </Button>
                              <Text c="dimmed" size="sm">
                                Organizer {campaign.organizerDisplayName || "Customer"}
                              </Text>
                              <Badge color={campaign.visibility === "public" ? "blue" : "gray"} variant="light" w="fit-content">
                                {campaign.visibility.replace(/_/g, " ")}
                              </Badge>
                            </Stack>
                          </Table.Td>
                          <Table.Td>
                            <Stack gap={2}>
                              <Text fw={700}>{campaign.serviceName}</Text>
                              <Text c="dimmed" size="sm">{campaign.locationName}</Text>
                              <Text c="dimmed" size="sm">Quantity {campaign.bookingQuantity}</Text>
                            </Stack>
                          </Table.Td>
                          <Table.Td>
                            <Stack gap={2}>
                              <Text>{formatBookingScheduleDateTime(campaign.scheduledStartAt)}</Text>
                              <Text c="dimmed" size="sm">
                                Ends {formatBookingScheduleDateTime(campaign.scheduledEndAt)}
                              </Text>
                              <Text c="dimmed" size="sm">
                                Deadline {formatBookingScheduleDateTime(campaign.fundingDeadlineAt)}
                              </Text>
                            </Stack>
                          </Table.Td>
                          <Table.Td>
                            <Stack gap={4}>
                              <CampaignFundingProgress
                                fundedAmountCents={campaign.fundedAmountCents}
                                targetAmountCents={fundingTargetAmountCents}
                              />
                              <Text c="dimmed" size="sm">
                                {campaign.paidParticipantCount}/{campaign.requiredContributors} verified · {formatMoney(campaign.requiredContributionAmountCents, campaign.currency)} each
                              </Text>
                            </Stack>
                          </Table.Td>
                          <Table.Td>
                            <Stack gap={4}>
                              <Badge color={getGroupFundedStatusColor(campaign.campaignStatus)} variant="light" w="fit-content">
                                {campaign.campaignStatus.replace(/_/g, " ")}
                              </Badge>
                              {isGroupFundedCampaignFullyRefunded(campaign) ? (
                                <Badge color="teal" variant="light" w="fit-content">
                                  Fully refunded
                                </Badge>
                              ) : null}
                            </Stack>
                          </Table.Td>
                          <Table.Td>
                            <Button
                              className="neura-secondary-button"
                              size="xs"
                              onClick={() => {
                                resetGroupFundedCampaignDecision();
                                closeGroupFundedContributionRejectModal();
                                setGroupFundedRefundNotes({});
                                setGroupFundedDetailId(campaign.id);
                              }}
                            >
                              Review
                            </Button>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            ) : (
              <DashboardEmptyState
                title="No group-funded campaigns"
                text="Campaigns for this branch will appear here when customers start or contribute to group-funded bookings."
              />
            )}
          </Stack>
        </Card>

        <Modal
          centered
          className="group-funded-detail-modal"
          opened={Boolean(groupFundedDetailId)}
          onClose={() => {
            setGroupFundedDetailId(null);
            resetGroupFundedCampaignDecision();
            closeGroupFundedContributionRejectModal();
            setGroupFundedRefundNotes({});
          }}
          size={1120}
          title={
            <Stack gap={2}>
              <Text className="booking-detail__eyebrow">Group-funded campaign</Text>
              <Text className="booking-detail__title">
                {selectedDetail
                  ? selectedDetailHasServiceBundle
                    ? `${selectedDetailBundleItems.length} bundled services`
                    : selectedDetail.campaign.serviceName
                  : "Loading campaign"}
              </Text>
            </Stack>
          }
        >
          {groupFundedDetailQuery.isFetching ? (
            <Text c="dimmed">Loading campaign details...</Text>
          ) : selectedDetail ? (
            <Stack className="group-funded-detail-content" gap="lg">
              <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
                <Paper withBorder radius="md" p="md">
                  <Text c="dimmed" size="xs">Status</Text>
                  <Badge color={getGroupFundedStatusColor(selectedDetail.campaign.campaignStatus)} variant="light">
                    {selectedDetail.campaign.campaignStatus.replace(/_/g, " ")}
                  </Badge>
                </Paper>
                <Paper withBorder radius="md" p="md">
                  <Text c="dimmed" size="xs">Funding</Text>
                  <Text fw={800}>
                    {formatMoney(selectedDetail.campaign.fundedAmountCents, selectedDetail.campaign.currency)}
                  </Text>
                  <Text c="dimmed" size="sm">
                    Target {formatMoney(selectedDetailFundingTargetAmountCents, selectedDetail.campaign.currency)}
                  </Text>
                </Paper>
                <Paper withBorder radius="md" p="md">
                  <Text c="dimmed" size="xs">Capacity hold</Text>
                  <Text fw={800}>{activeCapacityHold ? activeCapacityHold.holdStatus : "None"}</Text>
                  {activeCapacityHold ? (
                    <Text c="dimmed" size="sm">Expires {formatDateTime(activeCapacityHold.expiresAt)}</Text>
                  ) : null}
                </Paper>
              </SimpleGrid>

              <Paper withBorder radius="md" p="md">
                <Stack gap="md">
                  <Group align="flex-start" justify="space-between">
                    <div>
                      <Text className="finazze-section-label">Campaign details</Text>
                      <Title order={3}>{selectedDetail.campaign.campaignTitle || selectedDetail.campaign.serviceName}</Title>
                      <Text c="dimmed" size="sm">
                        Organized by {selectedDetail.campaign.organizerDisplayName || "Customer"}
                      </Text>
                    </div>
                    <Badge color={selectedDetail.campaign.visibility === "public" ? "blue" : "gray"} variant="light">
                      {selectedDetail.campaign.visibility === "public" ? "Public" : "Private link"}
                    </Badge>
                  </Group>

                  {selectedDetail.campaign.description ? (
                    <Spoiler hideLabel="Show less" maxHeight={72} showLabel="Show more">
                      <RichCampaignDescription
                        className="rich-campaign-description"
                        content={selectedDetail.campaign.description}
                      />
                    </Spoiler>
                  ) : (
                    <Text c="dimmed" size="sm">No campaign description provided.</Text>
                  )}

                  <Paper withBorder radius="md" p="sm">
                    <Stack gap="sm">
                      <Group justify="space-between" align="flex-start">
                        <Stack gap={2}>
                          <Text c="dimmed" size="xs">
                            {selectedDetailHasServiceBundle ? "Bundled services" : "Selected service"}
                          </Text>
                          <Text fw={800}>
                            {selectedDetailHasServiceBundle
                              ? `${selectedDetailBundleItems.length} services in this campaign`
                              : selectedDetailBundleItems[0]?.serviceName || selectedDetail.campaign.serviceName}
                          </Text>
                        </Stack>
                        <Badge color="teal" variant="light">
                          {selectedDetailHasServiceBundle ? "Service bundle" : "Single service"}
                        </Badge>
                      </Group>
                      <SimpleGrid cols={{ base: 1, sm: selectedDetailHasServiceBundle ? 2 : 1 }} spacing="sm">
                        {selectedDetailBundleItems.map((item) => (
                          <Paper key={item.id || item.serviceSlug} withBorder radius="md" p="sm">
                            <Stack gap={4}>
                              <Group justify="space-between" gap="sm" wrap="nowrap">
                                <Text fw={800}>{item.serviceName}</Text>
                                <Badge variant="light">x{item.bookingQuantity}</Badge>
                              </Group>
                              <Text c="dimmed" size="sm">
                                {formatBookingScheduleTimeRange(item.scheduledStartAt, item.scheduledEndAt)}
                              </Text>
                              <Text c="dimmed" size="sm">
                                {formatMoney(item.priceAmountCents, item.currency)}
                              </Text>
                            </Stack>
                          </Paper>
                        ))}
                      </SimpleGrid>
                    </Stack>
                  </Paper>

                  <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="sm">
                    <Stack gap={2}>
                      <Text c="dimmed" size="xs">Booking</Text>
                      <Text fw={700}>{formatBookingScheduleDateTime(selectedDetail.campaign.scheduledStartAt)}</Text>
                      <Text c="dimmed" size="sm">
                        Ends {formatBookingScheduleDateTime(selectedDetail.campaign.scheduledEndAt)}
                      </Text>
                    </Stack>
                    <Stack gap={2}>
                      <Text c="dimmed" size="xs">Service</Text>
                      <Text fw={700}>
                        {selectedDetailHasServiceBundle
                          ? `${selectedDetailBundleItems.length} bundled services`
                          : selectedDetail.campaign.serviceName}
                      </Text>
                      <Text c="dimmed" size="sm">
                        {selectedDetail.campaign.locationName} · {selectedDetailHasServiceBundle ? "Service bundle" : `Quantity ${selectedDetail.campaign.bookingQuantity}`}
                      </Text>
                    </Stack>
                    <Stack gap={2}>
                      <Text c="dimmed" size="xs">Deadline</Text>
                      <Text fw={700}>{formatBookingScheduleDateTime(selectedDetail.campaign.fundingDeadlineAt)}</Text>
                      <Text c="dimmed" size="sm">
                        Created {formatDateTime(selectedDetail.campaign.createdAt)}
                      </Text>
                    </Stack>
                    <Stack gap={2}>
                      <Text c="dimmed" size="xs">Contributors</Text>
                      <Text fw={700}>
                        {selectedDetail.campaign.paidParticipantCount}/{selectedDetail.campaign.requiredContributors} verified
                      </Text>
                      <Text c="dimmed" size="sm">
                        {formatMoney(selectedDetail.campaign.requiredContributionAmountCents, selectedDetail.campaign.currency)} each
                      </Text>
                    </Stack>
                  </SimpleGrid>
                </Stack>
              </Paper>

              <Paper className="group-funded-detail-table-card" withBorder radius="md" p="md">
                <Stack gap="sm">
                  <Group justify="space-between">
                    <div>
                      <Text fw={800}>Contribution proofs</Text>
                      <Text c="dimmed" size="sm">
                        {submittedContributions.length} submitted · {verifiedContributions.length} verified
                      </Text>
                    </div>
                  </Group>
                  {selectedDetail.contributions.length ? (
                    <Table.ScrollContainer className="group-funded-detail-table-scroll" minWidth={920}>
                      <Table className="neura-bookings-table neura-bookings-table--compact" verticalSpacing="sm">
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th className="neura-bookings-table__sticky neura-bookings-table__sticky-first group-funded-contributions-table__row-number">#</Table.Th>
                            <Table.Th className="group-funded-contributions-table__contributor">Contributor</Table.Th>
                            <Table.Th>Amount</Table.Th>
                            <Table.Th>Reference</Table.Th>
                            <Table.Th className="group-funded-contributions-table__status">Status</Table.Th>
                            <Table.Th>Actions</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {selectedDetail.contributions.map((contribution, index) => (
                            <Table.Tr key={contribution.id}>
                              <Table.Td className="neura-bookings-table__sticky neura-bookings-table__sticky-first group-funded-contributions-table__row-number">
                                {index + 1}
                              </Table.Td>
                              <Table.Td className="group-funded-contributions-table__contributor">
                                <Stack gap={2}>
                                  <Text fw={700}>{contribution.participantDisplayName || `User ${contribution.userId}`}</Text>
                                  <Text c="dimmed" size="xs">
                                    User {contribution.userId}
                                  </Text>
                                </Stack>
                              </Table.Td>
                              <Table.Td>{formatMoney(contribution.amountCents, contribution.currency)}</Table.Td>
                              <Table.Td>
                                <Stack gap={2}>
                                  <Text>{contribution.paymentReference || "-"}</Text>
                                  {contribution.paymentProof ? (
                                    <Group gap="xs">
                                      <Text c="dimmed" size="xs">
                                        Proof: {contribution.paymentProof.fileName}
                                      </Text>
                                      <Button
                                        color="dark"
                                        loading={busyAction === `group-funded-proof:${contribution.id}`}
                                        onClick={() => handleViewGroupFundedContributionProof(contribution)}
                                        size="compact-xs"
                                        variant="subtle"
                                      >
                                        View proof
                                      </Button>
                                    </Group>
                                  ) : null}
                                </Stack>
                              </Table.Td>
                              <Table.Td className="group-funded-contributions-table__status">
                                <Badge className="group-funded-contributions-table__status-badge" color={contribution.contributionStatus === "verified" ? "teal" : contribution.contributionStatus === "rejected" ? "red" : "yellow"} variant="light">
                                  {contribution.contributionStatus.replace(/_/g, " ")}
                                </Badge>
                              </Table.Td>
                              <Table.Td>
                                {contribution.contributionStatus === "submitted" && canAdminBookings ? (
                                  <Stack gap="xs">
                                    <Group gap="xs">
                                      <Button
                                        color="teal"
                                        disabled={
                                          busyAction === `group-funded-contribution-verify:${contribution.id}` ||
                                          selectedDetailFundingReached
                                        }
                                        onClick={() => handleVerifyGroupFundedContribution(contribution)}
                                        size="xs"
                                        variant="light"
                                      >
                                        Verify
                                      </Button>
                                      <Button
                                        color="red"
                                        disabled={busyAction === `group-funded-contribution-reject:${contribution.id}`}
                                        onClick={() => openGroupFundedContributionRejectModal(contribution)}
                                        size="xs"
                                        variant="light"
                                      >
                                        Reject
                                      </Button>
                                    </Group>
                                    {selectedDetailFundingReached ? (
                                      <Text c="dimmed" size="xs">
                                        Campaign is already fully funded. Reject remaining submitted proofs.
                                      </Text>
                                    ) : null}
                                  </Stack>
                                ) : (
                                  <Text c="dimmed" size="xs">No action</Text>
                                )}
                              </Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </Table.ScrollContainer>
                  ) : (
                    <Alert color="yellow" variant="light">No contribution proofs have been submitted yet.</Alert>
                  )}
                </Stack>
              </Paper>

              {selectedDetail.refunds.length ? (
                <Paper withBorder radius="md" p="md">
                  <Stack gap="sm">
                    <Group justify="space-between">
                      <Text fw={800}>Refund obligations</Text>
                      {isGroupFundedCampaignFullyRefunded(selectedDetail.campaign) ? (
                        <Badge color="teal" variant="light">All contributor refunds completed</Badge>
                      ) : null}
                    </Group>
                    {selectedDetail.refunds.map((refund) => (
                      <Paper key={refund.id} withBorder radius="md" p="sm">
                        <Stack gap="sm">
                          <Group align="flex-start" justify="space-between">
                            <div>
                              <Text fw={700}>{formatMoney(refund.amountCents, refund.currency)}</Text>
                              <Text c="dimmed" size="sm">
                                Reason {refund.refundReason.replace(/_/g, " ")} · User {refund.userId}
                              </Text>
                              {refund.completedAt ? (
                                <Text c="dimmed" size="sm">
                                  Completed {formatDateTime(refund.completedAt)}
                                </Text>
                              ) : null}
                            </div>
                            <Badge color={getGroupFundedRefundStatusColor(refund.refundStatus)} variant="light">
                              {refund.refundStatus.replace(/_/g, " ")}
                            </Badge>
                          </Group>
                          <Textarea
                            disabled={refund.refundStatus === "completed"}
                            label="Refund notes"
                            minRows={2}
                            onChange={(event) =>
                              setGroupFundedRefundNotes((current) => ({
                                ...current,
                                [refund.id]: event.currentTarget.value
                              }))
                            }
                            placeholder="Add reference number, channel, or internal handling notes"
                            value={groupFundedRefundNotes[refund.id] ?? refund.notes ?? ""}
                          />
                          {canAdminBookings ? (
                            <Group justify="flex-end">
                              <Button
                                disabled={refund.refundStatus === "completed"}
                                loading={busyAction === `group-funded-refund:${refund.id}:in_progress`}
                                onClick={() => handleUpdateGroupFundedRefund(refund, "in_progress")}
                                size="xs"
                                variant="light"
                              >
                                Mark in progress
                              </Button>
                              <Button
                                color="orange"
                                disabled={refund.refundStatus === "completed"}
                                loading={busyAction === `group-funded-refund:${refund.id}:policy_review_required`}
                                onClick={() => handleUpdateGroupFundedRefund(refund, "policy_review_required")}
                                size="xs"
                                variant="light"
                              >
                                Policy review
                              </Button>
                              <Button
                                color="teal"
                                disabled={refund.refundStatus === "completed"}
                                loading={busyAction === `group-funded-refund:${refund.id}:completed`}
                                onClick={() => handleUpdateGroupFundedRefund(refund, "completed")}
                                size="xs"
                              >
                                Mark refunded
                              </Button>
                            </Group>
                          ) : null}
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                </Paper>
              ) : null}

              {selectedDetail.campaign.campaignStatus === "vendor_review" && canAdminBookings ? (
                <Paper withBorder radius="md" p="md">
                  <Stack gap="sm">
                    <Text fw={800}>Vendor decision</Text>
                    <Text c="dimmed" size="sm">
                      Approval creates one linked paid booking for the organizer. Rejection makes verified contributions refund-eligible.
                    </Text>
                    <Select
                      clearable
                      data={groupFundedCampaignRejectionReasons.map((reason) => ({
                        label: reason.label,
                        value: reason.value
                      }))}
                      label="Common rejection reason"
                      onChange={(value) => {
                        setGroupFundedRejectReasonPreset(value);
                        const selectedReason = groupFundedCampaignRejectionReasons.find((reason) => reason.value === value);
                        setGroupFundedRejectReason(selectedReason?.reason || "");
                      }}
                      placeholder="Select a common reason"
                      value={groupFundedRejectReasonPreset}
                    />
                    <Textarea
                      label="Rejection reason"
                      disabled={!groupFundedUseCustomRejectReason}
                      minRows={2}
                      placeholder="Select a common reason or enable custom rejection reason"
                      value={groupFundedRejectReason}
                      onChange={(event) => setGroupFundedRejectReason(event.currentTarget.value)}
                    />
                    <Checkbox
                      checked={groupFundedUseCustomRejectReason}
                      label="Use custom rejection reason"
                      onChange={(event) => setGroupFundedUseCustomRejectReason(event.currentTarget.checked)}
                    />
                    <Group justify="flex-end">
                      <Button
                        color="red"
                        disabled={busyAction === `group-funded-reject:${selectedDetail.campaign.id}`}
                        onClick={() => handleRejectGroupFundedCampaign(selectedDetail.campaign)}
                        variant="light"
                      >
                        Reject campaign
                      </Button>
                      <Button
                        color="teal"
                        disabled={busyAction === `group-funded-approve:${selectedDetail.campaign.id}`}
                        onClick={() => handleApproveGroupFundedCampaign(selectedDetail.campaign)}
                      >
                        Approve booking
                      </Button>
                    </Group>
                  </Stack>
                </Paper>
              ) : null}
            </Stack>
          ) : (
            <Alert color="red">Campaign details could not be loaded.</Alert>
          )}
        </Modal>

        <Modal
          centered
          onClose={closeGroupFundedContributionRejectModal}
          opened={Boolean(groupFundedContributionToReject)}
          size="md"
          title="Reject contribution proof"
        >
          <Stack gap="md">
            <Text c="dimmed" size="sm">
              Tell the contributor why their payment proof cannot be accepted. They will see this reason in their campaign details.
            </Text>
            <Paper withBorder radius="md" p="sm">
              <Text fw={700}>
                {groupFundedContributionToReject?.participantDisplayName || `User ${groupFundedContributionToReject?.userId || ""}`}
              </Text>
              <Text c="dimmed" size="sm">
                {groupFundedContributionToReject
                  ? `${formatMoney(groupFundedContributionToReject.amountCents, groupFundedContributionToReject.currency)} · ${groupFundedContributionToReject.paymentReference || "No payment reference"}`
                  : ""}
              </Text>
            </Paper>
            <Select
              clearable
              data={groupFundedContributionRejectionReasons.map((reason) => ({ label: reason.label, value: reason.value }))}
              label="Common rejection reason"
              onChange={(value) => {
                setGroupFundedContributionRejectReasonPreset(value);
                const selectedReason = groupFundedContributionRejectionReasons.find((reason) => reason.value === value);
                setGroupFundedContributionRejectReason(selectedReason?.reason || "");
                setGroupFundedContributionUseCustomRejectReason(false);
              }}
              placeholder="Select a common reason"
              value={groupFundedContributionRejectReasonPreset}
            />
            <Checkbox
              checked={groupFundedContributionUseCustomRejectReason}
              label="Use custom rejection reason"
              onChange={(event) => {
                const useCustom = event.currentTarget.checked;
                setGroupFundedContributionUseCustomRejectReason(useCustom);
                setGroupFundedContributionRejectReasonPreset(null);
                setGroupFundedContributionRejectReason("");
              }}
            />
            <Textarea
              disabled={!groupFundedContributionUseCustomRejectReason}
              label="Custom rejection reason"
              minRows={3}
              onChange={(event) => setGroupFundedContributionRejectReason(event.currentTarget.value)}
              placeholder="Enable custom reason to write a contributor-visible explanation"
              value={groupFundedContributionRejectReason}
            />
            <Checkbox
              checked={groupFundedContributionRefundRequired}
              description="Use when payment was received but cannot be accepted."
              label="Refund required"
              onChange={(event) => setGroupFundedContributionRefundRequired(event.currentTarget.checked)}
            />
            <Group justify="flex-end">
              <Button onClick={closeGroupFundedContributionRejectModal} variant="default">Cancel</Button>
              <Button
                color="red"
                disabled={!groupFundedContributionRejectReason.trim()}
                loading={busyAction === `group-funded-contribution-reject:${groupFundedContributionToReject?.id}`}
                onClick={() => void handleRejectGroupFundedContribution()}
              >
                Reject contribution
              </Button>
            </Group>
          </Stack>
        </Modal>

        <Modal
          centered
          onClose={() => setGroupFundedProofModalOpen(false)}
          opened={groupFundedProofModalOpen}
          size="lg"
          title={
            <Stack className="getprio-modal-title" gap={2}>
              <Text className="getprio-modal-eyebrow">CONTRIBUTION EVIDENCE</Text>
              <Text className="getprio-modal-heading">Contribution payment proof</Text>
            </Stack>
          }
        >
          {groupFundedProofContribution?.paymentProof ? (
            <Stack gap="md">
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <Paper withBorder radius="md" p="md">
                  <Text className="finazze-section-label">Contributor</Text>
                  <Text fw={800}>
                    {groupFundedProofContribution.participantDisplayName || `User ${groupFundedProofContribution.userId}`}
                  </Text>
                  <Text c="dimmed" size="sm">User {groupFundedProofContribution.userId}</Text>
                </Paper>
                <Paper withBorder radius="md" p="md">
                  <Text className="finazze-section-label">Proof</Text>
                  <Text fw={800}>{groupFundedProofContribution.paymentProof.fileName}</Text>
                  <Text c="dimmed" size="sm">
                    {formatBytes(groupFundedProofContribution.paymentProof.sizeBytes)}
                  </Text>
                  <Text c="dimmed" size="sm">
                    Reference: {groupFundedProofContribution.paymentReference || "No reference"}
                  </Text>
                </Paper>
              </SimpleGrid>

              {groupFundedProofError ? (
                <Alert color="red" variant="light">
                  {groupFundedProofError}
                </Alert>
              ) : null}

              {groupFundedProofAccessUrl && groupFundedProofContribution.paymentProof.contentType.startsWith("image/") ? (
                <Image
                  alt="Contribution payment proof"
                  fit="contain"
                  mah={520}
                  radius="md"
                  src={groupFundedProofAccessUrl}
                />
              ) : groupFundedProofAccessUrl ? (
                <Box
                  component="iframe"
                  src={groupFundedProofAccessUrl}
                  title="Contribution payment proof"
                  w="100%"
                  h={520}
                  style={{ border: "1px solid #e2e8f0", borderRadius: 12 }}
                />
              ) : !groupFundedProofError ? (
                <Alert color="gray" variant="light">Loading private proof preview...</Alert>
              ) : null}

              {groupFundedProofAccessUrl ? (
                <Button
                  component="a"
                  href={groupFundedProofAccessUrl}
                  leftSection={<IconExternalLink size={16} />}
                  rel="noopener noreferrer"
                  target="_blank"
                  variant="light"
                  w="fit-content"
                >
                  Open proof in new tab
                </Button>
              ) : null}
            </Stack>
          ) : (
            <Alert color="gray" variant="light">No contribution proof selected.</Alert>
          )}
        </Modal>
      </Stack>
    );
  }

