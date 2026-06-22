import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title
} from "@mantine/core";
import { IconArrowLeft, IconCalendarCheck, IconClock, IconMapPin } from "@tabler/icons-react";
import { Link, Navigate, useParams } from "react-router-dom";
import type {
  CreateCustomerBookingRequest,
  CustomerBookingResponse,
  PublicVendorProfile,
  PublicVendorProfileResponse
} from "@shared";
import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../utils/errors";

function formatDateTimeLocal(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function getDefaultBookingTime() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return formatDateTimeLocal(date);
}

function getServiceLabel(service: PublicVendorProfile["services"][number]) {
  const price = service.priceDisplay || `PHP ${(service.priceAmountCents / 100).toLocaleString()}`;
  return `${service.name} - ${service.durationMinutes} min - ${price}`;
}

export default function BookingRequestPage() {
  const { tenantSlug = "", serviceSlug = "" } = useParams<{ tenantSlug: string; serviceSlug?: string }>();
  const { token, user, loading: authLoading } = useAuth();
  const [vendor, setVendor] = useState<PublicVendorProfile | null>(null);
  const [selectedLocationSlug, setSelectedLocationSlug] = useState("");
  const [selectedServiceSlug, setSelectedServiceSlug] = useState(serviceSlug);
  const [scheduledStartAt, setScheduledStartAt] = useState(getDefaultBookingTime);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [booking, setBooking] = useState<CustomerBookingResponse["booking"] | null>(null);

  useEffect(() => {
    if (!tenantSlug) {
      setError("Vendor not found.");
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError("");

    apiRequest<PublicVendorProfileResponse>(`/public/vendors/${tenantSlug}`)
      .then((data) => {
        if (!active) {
          return;
        }
        setVendor(data.vendor);
        setSelectedLocationSlug((current) => current || data.vendor.location.slug || data.vendor.locations[0]?.slug || "");
        setSelectedServiceSlug((current) => current || data.vendor.services[0]?.slug || "");
      })
      .catch((loadError) => {
        if (active) {
          setError(getErrorMessage(loadError));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [tenantSlug]);

  useEffect(() => {
    if (!user) {
      return;
    }

    setCustomerName((current) => current || user.name || "");
    setCustomerEmail((current) => current || user.email || "");
    setCustomerPhone((current) => current || user.phone || "");
  }, [user]);

  const selectedService = useMemo(
    () => vendor?.services.find((service) => service.slug === selectedServiceSlug) || null,
    [selectedServiceSlug, vendor]
  );
  const selectedLocation = useMemo(
    () => vendor?.locations.find((location) => location.slug === selectedLocationSlug) || null,
    [selectedLocationSlug, vendor]
  );
  const serviceOptions = useMemo(
    () => vendor?.services.map((service) => ({
      value: service.slug,
      label: getServiceLabel(service)
    })) || [],
    [vendor]
  );
  const locationOptions = useMemo(
    () => vendor?.locations.map((location) => ({
      value: location.slug,
      label: [location.name, location.city, location.province].filter(Boolean).join(", ")
    })) || [],
    [vendor]
  );

  if (authLoading || loading) {
    return <Card className="finazze-auth-card">Loading booking flow...</Card>;
  }

  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(`/vendors/${tenantSlug}/book/${serviceSlug}`)}`} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!vendor || !selectedServiceSlug || !selectedLocationSlug || !token) {
      return;
    }

    setSubmitting(true);
    setError("");

    const payload: CreateCustomerBookingRequest = {
      tenantSlug: vendor.slug,
      locationSlug: selectedLocationSlug,
      serviceSlug: selectedServiceSlug,
      scheduledStartAt: new Date(scheduledStartAt).toISOString(),
      customerName,
      customerEmail,
      customerPhone,
      notes
    };

    try {
      const response = await apiRequest<CustomerBookingResponse, CreateCustomerBookingRequest>("/account/bookings", {
        method: "POST",
        token,
        body: payload
      });
      setBooking(response.booking);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  if (booking) {
    return (
      <Stack className="customer-account-page" gap="lg">
        <Button component={Link} leftSection={<IconArrowLeft size={16} />} to={`/vendors/${booking.tenantSlug}`} variant="subtle" w="fit-content">
          Back to vendor
        </Button>
        <Card className="finazze-auth-card customer-account-card" p="xl">
          <Stack gap="md">
            <Badge color="teal" w="fit-content">Booking request submitted</Badge>
            <Title order={1}>{booking.reference}</Title>
            <Text c="dimmed">
              Your booking request is pending vendor confirmation.
            </Text>
            <Group gap="xl" align="flex-start">
              <Stack gap={2}>
                <Text fw={700}>Vendor</Text>
                <Text c="dimmed">{booking.tenantName}</Text>
              </Stack>
              <Stack gap={2}>
                <Text fw={700}>Service</Text>
                <Text c="dimmed">{booking.serviceName}</Text>
              </Stack>
              <Stack gap={2}>
                <Text fw={700}>Schedule</Text>
                <Text c="dimmed">{new Date(booking.scheduledStartAt).toLocaleString()}</Text>
              </Stack>
              <Stack gap={2}>
                <Text fw={700}>Status</Text>
                <Badge color="yellow" variant="light">{booking.status}</Badge>
              </Stack>
            </Group>
            <Group>
              <Button component={Link} color="dark" to="/account">
                View account history
              </Button>
              <Button component={Link} to={`/vendors/${booking.tenantSlug}`} variant="light">
                Back to vendor profile
              </Button>
            </Group>
          </Stack>
        </Card>
      </Stack>
    );
  }

  return (
    <Stack className="customer-account-page" gap="lg">
      <Button component={Link} leftSection={<IconArrowLeft size={16} />} to={`/vendors/${tenantSlug}`} variant="subtle" w="fit-content">
        Back to vendor
      </Button>

      <Card className="finazze-auth-card customer-account-card" p="xl">
        <Stack gap="sm">
          <Text className="finazze-section-label">Booking request</Text>
          <Title order={1}>{vendor?.name || "Book a service"}</Title>
          <Text c="dimmed">
            Choose a service, branch, and preferred schedule. The vendor will review and confirm the request.
          </Text>
        </Stack>
      </Card>

      <Card className="finazze-auth-card customer-account-card" p="xl">
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            {error ? <Alert color="red">{error}</Alert> : null}
            {!vendor?.services.length ? (
              <Alert color="yellow">This vendor has not published bookable services yet.</Alert>
            ) : null}

            <Select
              data={serviceOptions}
              disabled={!serviceOptions.length}
              label="Service"
              leftSection={<IconCalendarCheck size={16} />}
              onChange={(value) => setSelectedServiceSlug(value || "")}
              required
              value={selectedServiceSlug}
            />
            {selectedService ? (
              <Alert color="teal" variant="light">
                {selectedService.description || `${selectedService.durationMinutes} minute service`}
              </Alert>
            ) : null}

            <Select
              data={locationOptions}
              disabled={!locationOptions.length}
              label="Branch"
              leftSection={<IconMapPin size={16} />}
              onChange={(value) => setSelectedLocationSlug(value || "")}
              required
              value={selectedLocationSlug}
            />
            {selectedLocation ? (
              <Text c="dimmed" size="sm">
                {selectedLocation.name} {selectedLocation.city || selectedLocation.province ? `- ${[selectedLocation.city, selectedLocation.province].filter(Boolean).join(", ")}` : ""}
              </Text>
            ) : null}

            <TextInput
              label="Preferred date and time"
              leftSection={<IconClock size={16} />}
              min={formatDateTimeLocal(new Date())}
              onChange={(event) => setScheduledStartAt(event.currentTarget.value)}
              required
              type="datetime-local"
              value={scheduledStartAt}
            />

            <TextInput
              label="Name"
              onChange={(event) => setCustomerName(event.currentTarget.value)}
              required
              value={customerName}
            />
            <TextInput
              label="Email"
              onChange={(event) => setCustomerEmail(event.currentTarget.value)}
              type="email"
              value={customerEmail}
            />
            <TextInput
              label="Mobile number"
              onChange={(event) => setCustomerPhone(event.currentTarget.value)}
              value={customerPhone}
            />
            <Textarea
              label="Notes"
              minRows={3}
              onChange={(event) => setNotes(event.currentTarget.value)}
              value={notes}
            />

            <Group justify="space-between">
              <Text c="dimmed" size="sm">
                {selectedService ? getServiceLabel(selectedService) : "Select a service to continue."}
              </Text>
              <Button color="dark" disabled={submitting || !vendor?.services.length} type="submit">
                {submitting ? "Submitting..." : "Submit booking request"}
              </Button>
            </Group>
          </Stack>
        </form>
      </Card>
    </Stack>
  );
}
