import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, FileInput, Group, Image, Modal, Paper, SimpleGrid, Stack, Text, Textarea, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconArrowLeft, IconExternalLink, IconReceipt, IconTicket, IconUpload, IconX } from "@tabler/icons-react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import type {
  BookingPaymentProofAccessResponse,
  BookingPaymentProofUploadResponse,
  BookingStatus,
  CancelCustomerBookingResponse,
  CustomerBookingDetailResponse,
  CustomerBookingResponse,
  SubmitBookingPaymentProofRequest
} from "@shared";
import { API_BASE_URL, apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { buildJoinedQueuePathWithTicket } from "../queuePaths";
import {
  formatBookingScheduleDate,
  formatBookingScheduleTimeRange,
  formatDateTime
} from "../utils/dates";
import { getErrorMessage } from "../utils/errors";

function getBookingBadgeColor(status: BookingStatus): "gray" | "red" | "yellow" | "orange" | "teal" | "blue" {
  switch (status) {
    case "pending":
      return "yellow";
    case "confirmed":
      return "teal";
    case "rescheduled":
      return "blue";
    case "completed":
    case "reviewed":
      return "gray";
    case "canceled":
      return "red";
    case "disputed":
      return "orange";
    default:
      return "gray";
  }
}

function canCancel(status: BookingStatus, checkedInAt: string | Date | null, linkedTicket: unknown) {
  return ["pending", "confirmed", "rescheduled"].includes(status) && !checkedInAt && !linkedTicket;
}

function canSubmitPaymentProof(
  status: BookingStatus,
  checkedInAt: string | Date | null,
  linkedTicket: unknown,
  hasProof: boolean,
  serviceManualPaymentRequired: boolean
) {
  return serviceManualPaymentRequired && ["pending", "confirmed", "rescheduled"].includes(status) && !checkedInAt && !linkedTicket && !hasProof;
}

function formatBytes(sizeBytes: number | null) {
  if (!sizeBytes) {
    return "Unknown size";
  }

  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatPaymentAmount(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2
  }).format(amountCents / 100);
}

export default function CustomerBookingDetailPage() {
  const navigate = useNavigate();
  const { bookingId = "" } = useParams<{ bookingId: string }>();
  const { token, user, loading: authLoading } = useAuth();
  const [booking, setBooking] = useState<CustomerBookingDetailResponse["booking"] | null>(null);
  const [reason, setReason] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [proofBusy, setProofBusy] = useState(false);
  const [proofViewBusy, setProofViewBusy] = useState(false);
  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [proofAccessUrl, setProofAccessUrl] = useState("");
  const [error, setError] = useState("");
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  const loadBooking = useCallback(async (options: { showLoading?: boolean } = {}) => {
    if (!token || !bookingId) {
      return;
    }

    if (options.showLoading) {
      setLoading(true);
    }

    try {
      const data = await apiRequest<CustomerBookingDetailResponse>(`/account/bookings/${bookingId}`, { token });
      setBooking(data.booking);
      setError("");
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      if (options.showLoading) {
        setLoading(false);
      }
    }
  }, [bookingId, token]);

  useEffect(() => {
    let active = true;

    if (!token || !bookingId) {
      return undefined;
    }

    setLoading(true);
    loadBooking({ showLoading: false }).finally(() => {
      if (active) {
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [bookingId, loadBooking, token]);

  useEffect(() => {
    if (!token || !booking?.tenantSlug || !booking.locationSlug) {
      return undefined;
    }

    const streamUrl = `${API_BASE_URL}/public/tenant/${booking.tenantSlug}/location/${booking.locationSlug}/stream`;
    const eventSource = new EventSource(streamUrl);
    eventSource.onmessage = () => {
      void loadBooking();
    };
    eventSource.onerror = () => {
      eventSource.close();
    };

    const intervalId = window.setInterval(() => {
      void loadBooking();
    }, 10000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadBooking();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      eventSource.close();
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [booking?.locationSlug, booking?.tenantSlug, loadBooking, token]);

  if (authLoading || loading) {
    return <Card className="finazze-auth-card">Loading booking...</Card>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  async function handleCancel(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!token || !booking) {
      return;
    }

    setBusy(true);
    setError("");
    try {
      const data = await apiRequest<CancelCustomerBookingResponse, { reason?: string }>(
        `/account/bookings/${booking.id}`,
        {
          method: "DELETE",
          token,
          body: { reason }
        }
      );
      setBooking(data.booking);
      setReason("");
      setCancelModalOpen(false);
      notifications.show({
        color: "teal",
        title: "Booking cancelled",
        message: `${data.booking.reference} was cancelled.`
      });
    } catch (cancelError) {
      setError(getErrorMessage(cancelError));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitPaymentProof() {
    if (!token || !booking) {
      return;
    }

    const trimmedReference = paymentReference.trim();
    if (!trimmedReference) {
      setError("Payment reference is required.");
      return;
    }

    if (!paymentProofFile) {
      setError("Payment proof image is required.");
      return;
    }

    setProofBusy(true);
    setError("");
    try {
      const uploadResponse = await fetch(
        `${API_BASE_URL}/account/bookings/${booking.id}/payment-proof/uploads/direct?fileName=${encodeURIComponent(paymentProofFile.name)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": paymentProofFile.type
          },
          body: paymentProofFile
        }
      );

      if (!uploadResponse.ok) {
        throw new Error("Payment proof upload failed. Please try again.");
      }
      const uploadData = await uploadResponse.json() as BookingPaymentProofUploadResponse;

      const payload: SubmitBookingPaymentProofRequest = {
        paymentReference: trimmedReference,
        objectKey: uploadData.proof.objectKey,
        fileName: uploadData.proof.fileName,
        contentType: uploadData.proof.contentType,
        sizeBytes: uploadData.proof.sizeBytes
      };
      const data = await apiRequest<CustomerBookingResponse, SubmitBookingPaymentProofRequest>(
        `/account/bookings/${booking.id}/payment-proof`,
        {
          method: "POST",
          token,
          body: payload
        }
      );
      setBooking(data.booking);
      setPaymentReference("");
      setPaymentProofFile(null);
      notifications.show({
        color: "teal",
        title: "Payment proof submitted",
        message: `${data.booking.reference} is waiting for vendor verification.`
      });
    } catch (proofError) {
      setError(getErrorMessage(proofError));
    } finally {
      setProofBusy(false);
    }
  }

  async function handleViewPaymentProof() {
    if (!token || !booking?.paymentProof) {
      return;
    }

    setProofViewBusy(true);
    setError("");
    try {
      const data = await apiRequest<BookingPaymentProofAccessResponse>(
        `/account/bookings/${booking.id}/payment-proof`,
        { token }
      );
      setProofAccessUrl(data.access.url);
      setProofModalOpen(true);
    } catch (viewError) {
      setError(getErrorMessage(viewError));
    } finally {
      setProofViewBusy(false);
    }
  }

  if (!booking) {
    return (
      <Stack className="customer-account-page" gap="lg">
        <Button leftSection={<IconArrowLeft size={16} />} onClick={() => navigate("/account/bookings")} variant="subtle" w="fit-content">
          Back to bookings
        </Button>
        <Alert color="red">{error || "Booking not found."}</Alert>
      </Stack>
    );
  }

  const cancellationAllowed = canCancel(booking.status, booking.checkedInAt, booking.linkedTicket);
  const proofSubmissionAllowed = canSubmitPaymentProof(
    booking.status,
    booking.checkedInAt,
    booking.linkedTicket,
    Boolean(booking.paymentProof),
    booking.serviceManualPaymentRequired
  );
  const paymentProofStatus =
    booking.paymentVerifiedAt
      ? { color: "teal" as const, label: "Payment verified" }
      : booking.paymentRejectedAt
        ? { color: "red" as const, label: "Payment rejected" }
        : { color: "yellow" as const, label: "Awaiting vendor verification" };
  const hasExpired = Boolean(booking.expiredAt);
  const manualPaymentDestination = booking.manualPaymentDestination;
  const linkedQueuePath = booking.linkedTicket
    ? buildJoinedQueuePathWithTicket(
      booking.tenantSlug,
      booking.linkedTicket.lookupCode,
      booking.locationSlug
    )
    : "";
  const checkInAvailable = Boolean(booking.linkedTicket);
  const customerCheckInAvailable =
    booking.serviceManualPaymentRequired &&
    Boolean(booking.paymentProof) &&
    ["pending", "confirmed", "rescheduled"].includes(booking.status) &&
    !booking.checkedInAt &&
    !booking.linkedTicket;
  const paymentProofActionLabel = booking.paymentProof ? "View payment proof" : "Submit payment proof";
  const handleCustomerCheckIn = async () => {
    if (!token) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const data = await apiRequest<CustomerBookingDetailResponse>(`/account/bookings/${booking.id}/check-in`, {
        method: "POST",
        token
      });
      setBooking(data.booking);
      notifications.show({
        color: "teal",
        message: "Your check-in is confirmed."
      });
    } catch (checkInError) {
      setError(getErrorMessage(checkInError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack className="customer-account-page" gap="lg">
      <Button component={Link} leftSection={<IconArrowLeft size={16} />} to="/account/bookings" variant="subtle" w="fit-content">
        Back to bookings
      </Button>

      <Card className="finazze-auth-card customer-account-card" p="xl">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <div>
              <Text className="finazze-section-label">Booking detail</Text>
              <Title order={1}>{booking.reference}</Title>
            </div>
            <Badge color={getBookingBadgeColor(booking.status)} size="lg" variant="light">
              {hasExpired ? "expired" : booking.status}
            </Badge>
          </Group>

          {error ? <Alert color="red">{error}</Alert> : null}
          {hasExpired ? (
            <Alert color="orange" variant="light">
              {booking.expirationReason || "This pending booking expired before vendor confirmation or payment evidence submission."}
            </Alert>
          ) : null}

          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
            <Paper withBorder radius="md" p="md">
              <Text className="finazze-section-label">Vendor</Text>
              <Text fw={800}>{booking.tenantName}</Text>
              <Text c="dimmed" size="sm">{booking.locationName}</Text>
            </Paper>
            <Paper withBorder radius="md" p="md">
              <Text className="finazze-section-label">Service</Text>
              <Text fw={800}>{booking.serviceName}</Text>
              <Text c="dimmed" size="sm">Quantity {booking.bookingQuantity}</Text>
              <Text c="dimmed" size="sm">{booking.servicePriceDisplay}</Text>
            </Paper>
            <Paper withBorder radius="md" p="md">
              <Text className="finazze-section-label">Schedule</Text>
              <Text fw={800}>{formatBookingScheduleDate(booking.scheduledStartAt)}</Text>
              <Text c="dimmed" size="sm">
                {formatBookingScheduleTimeRange(booking.scheduledStartAt, booking.scheduledEndAt)}
              </Text>
            </Paper>
            <Paper withBorder radius="md" p="md">
              <Text className="finazze-section-label">Payment</Text>
              <Badge color={booking.paymentStatus === "paid" ? "teal" : "gray"} variant="light">
                {booking.paymentStatus}
              </Badge>
              {booking.paymentProof ? (
                <Text c="dimmed" mt="xs" size="sm">{paymentProofStatus.label}</Text>
              ) : null}
            </Paper>
          </SimpleGrid>

          {booking.status === "confirmed" || booking.status === "rescheduled" ? (
            <Alert color="blue" variant="light">
              Arrive near your scheduled time. A queue ticket appears here only after vendor check-in.
            </Alert>
          ) : null}

          <Paper withBorder radius="lg" p="md">
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start">
                <Stack gap={2}>
                  <Text fw={800}>Actions</Text>
                  <Text c="dimmed" size="sm">
                    If you submitted payment proof, you can check in here on the booking day. Otherwise wait for vendor check-in.
                  </Text>
                </Stack>
                {booking.checkedInAt ? (
                  <Badge color="teal" variant="light">
                    Checked in {formatDateTime(booking.checkedInAt)}
                  </Badge>
                ) : (
                  <Badge color={checkInAvailable ? "blue" : "gray"} variant="light">
                    {checkInAvailable ? "Queue ticket ready" : "Check-in not available"}
                  </Badge>
                )}
              </Group>
              <Group gap="sm">
                {customerCheckInAvailable ? (
                  <Button leftSection={<IconTicket size={16} />} loading={busy} onClick={handleCustomerCheckIn}>
                    Check in now
                  </Button>
                ) : checkInAvailable ? (
                  <Button component={Link} leftSection={<IconTicket size={16} />} to={linkedQueuePath}>
                    Check-in
                  </Button>
                ) : (
                  <Button disabled leftSection={<IconTicket size={16} />} variant="default">
                    Check-in
                  </Button>
                )}
                {booking.paymentProof ? (
                  <Button
                    leftSection={<IconReceipt size={16} />}
                    loading={proofViewBusy}
                    onClick={handleViewPaymentProof}
                    variant="light"
                  >
                    {paymentProofActionLabel}
                  </Button>
                ) : proofSubmissionAllowed ? (
                  <Button
                    leftSection={<IconUpload size={16} />}
                    onClick={() => {
                      document.getElementById("payment-proof-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    variant="light"
                  >
                    {paymentProofActionLabel}
                  </Button>
                ) : (
                  <Button disabled leftSection={<IconReceipt size={16} />} variant="light">
                    {paymentProofActionLabel}
                  </Button>
                )}
                <Button
                  color="red"
                  disabled={!cancellationAllowed}
                  leftSection={<IconX size={16} />}
                  onClick={() => setCancelModalOpen(true)}
                  variant="subtle"
                >
                  Cancel booking
                </Button>
              </Group>
            </Stack>
          </Paper>

          {booking.linkedTicket ? (
            <Card withBorder radius="md" p="md">
              <Group justify="space-between" align="center">
                <Stack gap={2}>
                  <Text fw={700}>Linked queue ticket</Text>
                  <Text c="dimmed">{booking.linkedTicket.ticketNumber}</Text>
                </Stack>
                <Button
                  component={Link}
                  leftSection={<IconTicket size={16} />}
                  to={linkedQueuePath}
                  variant="light"
                >
                  Open live queue status
                </Button>
              </Group>
            </Card>
          ) : null}
        </Stack>
      </Card>

      {!booking.paymentProof && proofSubmissionAllowed ? (
        <Card className="finazze-auth-card customer-account-card" id="payment-proof-section" p="xl">
        <Stack gap="md">
          <div>
            <Text className="finazze-section-label">Payment proof</Text>
            <Title order={2}>Submit manual payment evidence</Title>
          </div>

          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl" verticalSpacing="lg">
              <Card withBorder radius="md" p="md">
                {manualPaymentDestination ? (
                  <Stack gap="md">
                    <Image
                      alt={`${manualPaymentDestination.methodLabel} payment QR`}
                      fit="contain"
                      mah={320}
                      radius="sm"
                      src={manualPaymentDestination.qrImageUrl}
                      w="100%"
                    />
                    <Stack gap={4}>
                      <Badge color="yellow" variant="light" w="fit-content">Vendor payment QR</Badge>
                      <Text fw={700}>Pay vendor through {manualPaymentDestination.methodLabel}</Text>
                      <Text c="dimmed" size="sm">{manualPaymentDestination.accountDisplayName}</Text>
                      {manualPaymentDestination.accountIdentifierDisplay ? (
                        <Text c="dimmed" size="sm">{manualPaymentDestination.accountIdentifierDisplay}</Text>
                      ) : null}
                      <Text fw={700} mt="xs">
                        Total payable: {formatPaymentAmount(manualPaymentDestination.amountCents, manualPaymentDestination.currency)}
                      </Text>
                      <Text c="dimmed" size="sm">
                        {manualPaymentDestination.unitPriceDisplay} x {booking.bookingQuantity}
                      </Text>
                    </Stack>
                  </Stack>
                ) : (
                  <Alert color="yellow" variant="light">
                    The vendor payment QR is not available for this booking yet. Contact the vendor before sending payment.
                  </Alert>
                )}
              </Card>

              <Stack gap="sm">
                <Alert color="blue" variant="light">
                  Upload a screenshot or photo of your vendor payment receipt. The proof stays private and is only available to you and authorized vendor users.
                </Alert>
                <TextInput
                  label="Payment reference"
                  onChange={(event) => setPaymentReference(event.currentTarget.value)}
                  placeholder="Reference number from your bank or wallet"
                  value={paymentReference}
                />
                <FileInput
                  accept="image/jpeg,image/png,image/webp"
                  clearable
                  label="Proof image"
                  leftSection={<IconUpload size={16} />}
                  onChange={setPaymentProofFile}
                  placeholder="Choose JPEG, PNG, or WebP"
                  value={paymentProofFile}
                />
                <Button
                  disabled={!paymentReference.trim() || !paymentProofFile}
                  loading={proofBusy}
                  onClick={handleSubmitPaymentProof}
                  w="fit-content"
                >
                  Submit payment proof
                </Button>
              </Stack>
            </SimpleGrid>
        </Stack>
        </Card>
      ) : null}

      <Modal
        centered
        onClose={() => setProofModalOpen(false)}
        opened={proofModalOpen}
        size="lg"
        title="Payment proof"
      >
        {booking.paymentProof ? (
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <Paper withBorder radius="md" p="md">
                <Text className="finazze-section-label">File</Text>
                <Text fw={700}>{booking.paymentProof.fileName}</Text>
                <Text c="dimmed" size="sm">{formatBytes(booking.paymentProof.sizeBytes)}</Text>
                <Text c="dimmed" size="sm">
                  {booking.paymentProof.uploadedAt ? formatDateTime(booking.paymentProof.uploadedAt) : "Upload time unavailable"}
                </Text>
              </Paper>
              <Paper withBorder radius="md" p="md">
                <Text className="finazze-section-label">Status</Text>
                <Badge color={paymentProofStatus.color} variant="light" w="fit-content">
                  {paymentProofStatus.label}
                </Badge>
                <Text c="dimmed" mt="xs" size="sm">
                  Reference: {booking.paymentReference || "No reference"}
                </Text>
              </Paper>
            </SimpleGrid>
            {booking.paymentRejectedAt && booking.paymentRejectionReason ? (
              <Alert color="red" variant="light">
                {booking.paymentRejectionReason}
              </Alert>
            ) : null}
            {proofAccessUrl ? (
              <Image alt="Uploaded payment proof" fit="contain" mah={520} radius="md" src={proofAccessUrl} />
            ) : (
              <Alert color="gray" variant="light">Open the proof again to refresh the private image link.</Alert>
            )}
            {proofAccessUrl ? (
              <Button
                component="a"
                href={proofAccessUrl}
                leftSection={<IconExternalLink size={16} />}
                rel="noopener noreferrer"
                target="_blank"
                variant="light"
                w="fit-content"
              >
                Open image in new tab
              </Button>
            ) : null}
          </Stack>
        ) : (
          <Alert color="gray" variant="light">No payment proof has been uploaded for this booking.</Alert>
        )}
      </Modal>

      <Modal
        centered
        onClose={() => setCancelModalOpen(false)}
        opened={cancelModalOpen}
        size="md"
        title="Cancel booking"
      >
        <form onSubmit={handleCancel}>
          <Stack gap="md">
            <Alert color="red" variant="light">
              This will cancel the booking immediately. You will need to make a new booking if you still want the service.
            </Alert>
            <Textarea
              label="Cancellation reason"
              minRows={4}
              onChange={(event) => setReason(event.currentTarget.value)}
              placeholder="Tell the vendor why you are cancelling"
              value={reason}
            />
            <Group justify="flex-end">
              <Button disabled={busy} onClick={() => setCancelModalOpen(false)} variant="default">
                Keep booking
              </Button>
              <Button color="red" loading={busy} type="submit">
                Cancel booking
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
