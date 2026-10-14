import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "../vendor/AccountFields";
import {
  useAccountTask,
  discardAccountTask,
} from "../vendor/AccountPresentation";
import { TaskDialog } from "../vendor/TaskDialog";
import { apiRequest } from "../api/client";

type Resource = {
  limit: number;
  used: number | null;
  creditRemaining: number;
  resetAt: string | null;
};
type Capacity = {
  planSlug: string | null;
  lifecycleState: string;
  resources: Record<string, Resource>;
  lots?: Array<{
    id: string;
    resourceKey: string;
    remainingUnits: number;
    expiresAt: string | null;
    status: string;
    sourceType: string;
  }>;
};
type Pack = {
  code: string;
  name: string;
  ticketUnits: number;
  priceDisplay: string;
};
const labels: Record<string, string> = {
  queueTickets: "Queue Tickets",
  serviceBookings: "Service Bookings",
};

export default function VendorCapacityPanel({
  tenantSlug,
  token,
}: {
  tenantSlug: string;
  token: string;
}) {
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [commercial, setCommercial] = useState(false);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [exitOpened, setExitOpened] = useState(false);
  const [exitReason, setExitReason] = useState("");
  const [experienceEnabled, setExperienceEnabled] = useState<boolean | null>(
    null,
  );
  const [loadRevision, setLoadRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  useAccountTask(Boolean(busy), exitOpened && Boolean(exitReason));
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setCapacity(null);
    setPacks([]);
    setExperienceEnabled(null);
    if (!tenantSlug) return;
    apiRequest<{ vendorCapacityExperience: boolean }>("/billing/capabilities", {
      token,
    })
      .then((capabilities) => {
        if (cancelled) return null;
        setExperienceEnabled(capabilities.vendorCapacityExperience);
        if (!capabilities.vendorCapacityExperience) return null;
        return apiRequest<{ capacity: Capacity; commercial: boolean }>(
          `/billing/tenant/${tenantSlug}/capacity`,
          { token },
        );
      })
      .then(async (data) => {
        if (!data || cancelled) return;
        setCapacity(data.capacity);
        setCommercial(data.commercial);
        if (data.commercial) {
          const response = await apiRequest<{ packs: Pack[] }>(
            "/billing/credit-packs",
            { token },
          );
          if (!cancelled) setPacks(response.packs);
        }
      })
      .catch((loadError) => {
        if (!cancelled)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Capacity is unavailable.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, token, loadRevision]);
  async function buy(packCode: string) {
    setBusy(packCode);
    setError("");
    try {
      const reason = "Vendor purchased a Usage Credit pack";
      const payload = { packCode };
      const preview = await apiRequest<{
        confirmation: { token: string };
        preview: { revision: string };
      }>(`/billing/tenant/${tenantSlug}/commercial-actions/preview`, {
        method: "POST",
        token,
        body: { action: "credit.checkout", reason, payload },
      });
      const result = await apiRequest<{ checkoutUrl: string }>(
        `/billing/tenant/${tenantSlug}/credit-checkout`,
        {
          method: "POST",
          token,
          headers: { "X-Transaction-Confirmation": preview.confirmation.token },
          body: { packCode, reason, previewRevision: preview.preview.revision },
        },
      );
      window.location.assign(result.checkoutUrl);
    } catch (purchaseError) {
      setError(
        purchaseError instanceof Error
          ? purchaseError.message
          : "Checkout is unavailable.",
      );
      setBusy("");
    }
  }
  async function requestPaidExit() {
    if (exitReason.trim().length < 8) return;
    setBusy("paid-exit");
    setError("");
    try {
      const preview = await apiRequest<{
        confirmation: { token: string };
        preview: { revision: string };
      }>(`/billing/tenant/${tenantSlug}/subscription-transitions/preview`, {
        method: "POST",
        token,
        body: { toPlanSlug: "free", reason: exitReason },
      });
      await apiRequest(
        `/billing/tenant/${tenantSlug}/subscription-transitions`,
        {
          method: "POST",
          token,
          headers: { "X-Transaction-Confirmation": preview.confirmation.token },
          body: {
            toPlanSlug: "free",
            reason: exitReason,
            previewRevision: preview.preview.revision,
          },
        },
      );
      setExitOpened(false);
      setExitReason("");
    } catch (transitionError) {
      setError(
        transitionError instanceof Error
          ? transitionError.message
          : "The plan change could not be scheduled.",
      );
    } finally {
      setBusy("");
    }
  }
  if (experienceEnabled === false) return null;
  if (loading) return <Text c="dimmed">Loading monthly capacity…</Text>;
  if (error && !capacity)
    return (
      <Alert color="red">
        {error}
        <Button
          onClick={() => setLoadRevision((value) => value + 1)}
          variant="default"
        >
          Retry capacity
        </Button>
      </Alert>
    );
  if (!capacity) return <Text c="dimmed">Loading monthly capacity…</Text>;
  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Text className="neura-label">MONTHLY CAPACITY</Text>
          <Title order={3}>
            {commercial ? "Plan usage and credits" : "Operational capacity"}
          </Title>
        </div>
        <Badge variant="light">
          {capacity.planSlug || capacity.lifecycleState}
        </Badge>
      </Group>
      {error && !exitOpened ? (
        <Alert color="red">
          {error}
          <Button
            disabled={Boolean(busy)}
            onClick={() => setLoadRevision((value) => value + 1)}
            variant="default"
          >
            Refresh capacity
          </Button>
        </Alert>
      ) : null}
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        {Object.entries(capacity.resources).filter(([key]) => key !== "queueEmailJourneys").map(([key, resource]) => {
          if (resource.used === null) return <Card key={key} withBorder><Stack gap="xs"><Text fw={700}>{labels[key] || key}</Text><Title order={4}>Usage unavailable</Title><Text c="dimmed" size="sm">Current-period usage is unavailable. Refresh before relying on remaining capacity.</Text></Stack></Card>;
          const available =
            Math.max(0, resource.limit - resource.used) +
            resource.creditRemaining;
          const percentage =
            resource.limit > 0
              ? Math.min(100, (resource.used / resource.limit) * 100)
              : 100;
          return (
            <Card key={key} withBorder>
              <Stack gap="xs">
                <Text fw={700}>{labels[key] || key}</Text>
                <Title order={4}>{available.toLocaleString()} available</Title>
                <progress
                  className="account-capacity-progress"
                  aria-label={`${labels[key] || key} monthly usage`}
                  max={100}
                  value={percentage}
                />
                <Text c="dimmed" size="sm">
                  {resource.used.toLocaleString()} of{" "}
                  {resource.limit.toLocaleString()} monthly units used
                  {resource.creditRemaining
                    ? ` + ${resource.creditRemaining.toLocaleString()} credits`
                    : ""}
                </Text>
                {resource.resetAt ? (
                  <Text c="dimmed" size="xs">
                    Resets {new Date(resource.resetAt).toLocaleDateString()}
                  </Text>
                ) : null}
              </Stack>
            </Card>
          );
        })}
      </SimpleGrid>
      {commercial ? (
        <>
          <div>
            <Title order={4}>Usage Credits</Title>
            <Text c="dimmed" size="sm">
              Ticket credits carry forward and add to your queue ticket allowance. They do not add to service booking allowances.
            </Text>
          </div>
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            {packs.filter((pack) => pack.ticketUnits > 0).map((pack) => (
              <Card key={pack.code} withBorder>
                <Stack>
                  <Group justify="space-between">
                    <Text fw={700}>{pack.code}</Text>
                    <Badge>{pack.priceDisplay}</Badge>
                  </Group>
                  <Text size="sm">
                    {pack.ticketUnits.toLocaleString()} Tickets
                  </Text>
                  <Button
                    disabled={Boolean(busy)}
                    loading={busy === pack.code}
                    onClick={() => void buy(pack.code)}
                  >
                    Buy credits
                  </Button>
                </Stack>
              </Card>
            ))}
          </SimpleGrid>
          {capacity.planSlug !== "free" ? (
            <Card withBorder>
              <Group justify="space-between" align="center">
                <div>
                  <Text fw={700}>Paid plan exit</Text>
                  <Text c="dimmed" size="sm">
                    Keep paid access through the current term, then move to the
                    queue-only Free plan.
                  </Text>
                </div>
                <Button
                  disabled={Boolean(busy)}
                  variant="light"
                  onClick={() => setExitOpened(true)}
                >
                  Schedule move to Free
                </Button>
              </Group>
            </Card>
          ) : null}
          <TaskDialog
            opened={exitOpened}
            busy={Boolean(busy)}
            onClose={() => {
              if (!busy && discardAccountTask(true, Boolean(exitReason))) {
                setExitOpened(false);
                setExitReason("");
                setError("");
              }
            }}
            eyebrow="PLAN CHANGE"
            title="Move to Free at term end"
            footer={
              <>
                <Button
                  disabled={Boolean(busy)}
                  variant="default"
                  onClick={() => {
                    if (discardAccountTask(true, Boolean(exitReason))) {
                      setExitOpened(false);
                      setExitReason("");
                      setError("");
                    }
                  }}
                >
                  Keep current plan
                </Button>
                <Button
                  loading={busy === "paid-exit"}
                  disabled={Boolean(busy) || exitReason.trim().length < 8}
                  onClick={() => void requestPaidExit()}
                >
                  Schedule change
                </Button>
              </>
            }
          >
            <Stack>
              <Text>
                Your current paid features remain available until the end of the
                billing term. Usage Credits stay with your account.
              </Text>
              {error ? <Alert color="red">{error}</Alert> : null}
              <TextInput
                disabled={Boolean(busy)}
                label="Reason for this change"
                description="Enter at least 8 characters."
                value={exitReason}
                onChange={(event) => setExitReason(event.target.value)}
              />
            </Stack>
          </TaskDialog>
        </>
      ) : (
        <Alert color="blue">
          You can see whether the team can keep operating. Owners and
          administrators manage plans, purchases, and billing details.
        </Alert>
      )}
    </Stack>
  );
}
