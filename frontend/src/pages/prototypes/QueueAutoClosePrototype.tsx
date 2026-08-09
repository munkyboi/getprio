/**
 * THROWAWAY PROTOTYPE — delete after the queue auto-close interaction is selected.
 *
 * Three variants of the vendor queue auto-close warning, switchable through
 * ?queueClosePrototype=1&variant=A|B|C on the existing /dashboard/queue route.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconClock,
  IconLock,
  IconRefresh
} from "@tabler/icons-react";
import { useLocation, useNavigate } from "react-router-dom";
import "./QueueAutoClosePrototype.css";

type VariantKey = "A" | "B" | "C";
type ScenarioKey =
  | "warning"
  | "extended"
  | "reconciling"
  | "closed"
  | "error"
  | "denied"
  | "reconnected";

const VARIANTS: Array<{ key: VariantKey; name: string }> = [
  { key: "A", name: "Sticky command banner" },
  { key: "B", name: "Queue command rail" },
  { key: "C", name: "Global action tray" }
];

const SCENARIOS: Array<{ value: ScenarioKey; label: string }> = [
  { value: "warning", label: "15-minute warning" },
  { value: "extended", label: "Extension active" },
  { value: "reconciling", label: "Closing / reconciling" },
  { value: "closed", label: "Closed" },
  { value: "error", label: "Reconciliation failure" },
  { value: "denied", label: "Permission denied" },
  { value: "reconnected", label: "Reload / reconnected" }
];

const TICKET_IMPACT = {
  waiting: 8,
  carried: 2,
  skipped: 1,
  called: 1
};

function initialSeconds(scenario: ScenarioKey) {
  if (scenario === "warning") return 12 * 60 + 42;
  if (scenario === "reconnected") return 9 * 60 + 18;
  if (scenario === "extended") return 29 * 60 + 50;
  if (scenario === "denied") return 11 * 60 + 5;
  return 0;
}

function formatCountdown(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function isEditableTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return Boolean(
    element?.closest("input, textarea, select, [contenteditable='true']")
  );
}

function ImpactSummary({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "qacp-impact qacp-impact-compact" : "qacp-impact"}>
      <div>
        <strong>{TICKET_IMPACT.waiting}</strong>
        <span>waiting → carry-over</span>
      </div>
      <div>
        <strong>{TICKET_IMPACT.carried}</strong>
        <span>carried → expire</span>
      </div>
      <div>
        <strong>{TICKET_IMPACT.called}</strong>
        <span>called → unserved</span>
      </div>
      <div>
        <strong>{TICKET_IMPACT.skipped}</strong>
        <span>skipped → recovery ends</span>
      </div>
    </div>
  );
}

function MockTicketList() {
  return (
    <Stack gap="xs">
      {[
        ["M024", "Maya Santos", "Called", "red"],
        ["M025", "Jose Rivera", "Carry-over", "violet"],
        ["M026", "Nina Cruz", "Waiting", "blue"],
        ["M027", "Ari Lopez", "Waiting", "blue"]
      ].map(([number, name, status, color]) => (
        <Paper className="qacp-ticket-row" key={number} p="sm" radius="md" withBorder>
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon color={color} radius="xl" variant="light">
                {number.slice(-2)}
              </ThemeIcon>
              <div>
                <Text fw={800}>{number}</Text>
                <Text c="dimmed" size="xs">{name}</Text>
              </div>
            </Group>
            <Badge color={color} variant="light">{status}</Badge>
          </Group>
        </Paper>
      ))}
    </Stack>
  );
}

function QueueStatusBadge({ scenario }: { scenario: ScenarioKey }) {
  if (scenario === "closed") {
    return <Badge color="gray" variant="light">Closed</Badge>;
  }
  if (scenario === "reconciling") {
    return <Badge color="orange" variant="light">Closing</Badge>;
  }
  if (scenario === "error") {
    return <Badge color="red" variant="light">State locked</Badge>;
  }
  return <Badge color="teal" variant="light">Accepting</Badge>;
}

function QueueContext({ children }: { children?: ReactNode }) {
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Card className="qacp-context-card" padding="md">
          <Text c="dimmed" size="xs" tt="uppercase" fw={800}>Now serving</Text>
          <Title order={2}>M024</Title>
          <Text size="sm">Maya Santos</Text>
        </Card>
        <Card className="qacp-context-card" padding="md">
          <Text c="dimmed" size="xs" tt="uppercase" fw={800}>Waiting</Text>
          <Title order={2}>10</Title>
          <Text size="sm">22 mins estimated</Text>
        </Card>
        <Card className="qacp-context-card" padding="md">
          <Text c="dimmed" size="xs" tt="uppercase" fw={800}>Served today</Text>
          <Title order={2}>41</Title>
          <Text size="sm">Main branch</Text>
        </Card>
      </SimpleGrid>
      {children}
    </Stack>
  );
}

function StateMessage({
  scenario,
  onRetry
}: {
  scenario: ScenarioKey;
  onRetry: () => void;
}) {
  if (scenario === "reconciling") {
    return (
      <Alert color="orange" icon={<Loader color="orange" size={18} />} title="Closing queue">
        Ticket outcomes are being reconciled. Queue actions are temporarily locked.
      </Alert>
    );
  }

  if (scenario === "closed") {
    return (
      <Alert color="gray" icon={<IconCheck size={18} />} title="Queue closed at 6:00 PM">
        8 tickets await carry-over, 2 expired, 1 became unserved, and skipped recovery ended.
      </Alert>
    );
  }

  if (scenario === "error") {
    return (
      <Alert
        color="red"
        icon={<IconAlertTriangle size={18} />}
        title="We could not confirm the queue state"
      >
        <Stack gap="sm">
          <Text size="sm">
            Queue actions stay locked to prevent joins after the deadline. Retry the live status.
          </Text>
          <Button
            color="red"
            leftSection={<IconRefresh size={16} />}
            onClick={onRetry}
            variant="light"
          >
            Retry status
          </Button>
        </Stack>
      </Alert>
    );
  }

  if (scenario === "extended") {
    return (
      <Alert color="teal" icon={<IconCheck size={18} />} title="Queue extended until 6:30 PM">
        A new 15-minute warning begins at 6:15 PM. Intake remains open.
      </Alert>
    );
  }

  if (scenario === "reconnected") {
    return (
      <Alert color="blue" icon={<IconRefresh size={18} />} title="Live state restored">
        Countdown synchronized with the server deadline after reconnecting.
      </Alert>
    );
  }

  if (scenario === "denied") {
    return (
      <Alert color="yellow" icon={<IconLock size={18} />} title="Extension permission required">
        You can monitor the countdown, but only an authorized queue operator can extend or close.
      </Alert>
    );
  }

  return null;
}

type WarningActionsProps = {
  disabled?: boolean;
  scenario: ScenarioKey;
  onClose: () => void;
  onExtend: () => void;
};

function WarningActions({
  disabled,
  scenario,
  onClose,
  onExtend
}: WarningActionsProps) {
  const queueLocked = ["reconciling", "closed", "error"].includes(scenario);
  const extensionLocked = queueLocked || scenario === "extended";
  return (
    <Stack gap="xs">
      <Button
        className="qacp-extend-button"
        disabled={Boolean(disabled || extensionLocked)}
        onClick={onExtend}
        size="md"
      >
        {scenario === "extended" ? "Extension active" : "Cancel auto-close"}
      </Button>
      <Text className="qacp-action-hint" size="xs">
        {scenario === "extended"
          ? "A fresh warning will appear 15 minutes before 6:30 PM."
          : "Adds 30 minutes and records your action."}
      </Text>
      <Button
        color="red"
        disabled={Boolean(disabled || queueLocked)}
        onClick={onClose}
        variant="subtle"
      >
        Close queue now
      </Button>
    </Stack>
  );
}

type VariantProps = {
  countdown: string;
  scenario: ScenarioKey;
  onClose: () => void;
  onExtend: () => void;
  onRetry: () => void;
  onReview?: () => void;
};

function replacesWarningSurface(scenario: ScenarioKey) {
  return ["reconciling", "closed", "error"].includes(scenario);
}

function VariantA({
  countdown,
  scenario,
  onClose,
  onExtend,
  onRetry
}: VariantProps) {
  const warningReplaced = replacesWarningSurface(scenario);

  return (
    <QueueContext>
      {warningReplaced ? (
        <Paper className="qacp-state-replacement" role="status">
          <StateMessage onRetry={onRetry} scenario={scenario} />
        </Paper>
      ) : (
        <Paper className="qacp-banner" role="region" aria-label="Queue auto-close warning">
          <div className="qacp-banner-title">
            <ThemeIcon color="red" radius="xl" size={44} variant="filled">
              <IconAlertTriangle size={24} />
            </ThemeIcon>
            <div>
              <Text className="qacp-kicker">Auto-close warning</Text>
              <Title order={2}>Queue closes in</Title>
            </div>
            <div aria-atomic="true" aria-live="polite" className="qacp-countdown">
              {countdown}
            </div>
          </div>
          <div className="qacp-banner-impact">
            <Text fw={800}>If no one extends the queue:</Text>
            <ImpactSummary compact />
          </div>
          <WarningActions
            disabled={scenario === "denied"}
            onClose={onClose}
            onExtend={onExtend}
            scenario={scenario}
          />
        </Paper>
      )}
      {!warningReplaced ? <StateMessage onRetry={onRetry} scenario={scenario} /> : null}
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card className="qacp-context-card" padding="lg">
          <Group justify="space-between" mb="md">
            <div>
              <Text fw={800}>Current queue</Text>
              <Text c="dimmed" size="sm">The warning stays above this page.</Text>
            </div>
            <QueueStatusBadge scenario={scenario} />
          </Group>
          <MockTicketList />
        </Card>
        <Card className="qacp-context-card" padding="lg">
          <Text fw={800}>Why try this</Text>
          <Text c="dimmed" mt="xs" size="sm">
            Maximum visibility and consequence clarity. The command occupies meaningful
            vertical space but remains unmistakable on a busy queue screen.
          </Text>
        </Card>
      </SimpleGrid>
    </QueueContext>
  );
}

function VariantB({
  countdown,
  scenario,
  onClose,
  onExtend,
  onRetry
}: VariantProps) {
  const warningReplaced = replacesWarningSurface(scenario);

  return (
    <div className="qacp-rail-layout">
      <QueueContext>
        <Card className="qacp-context-card" padding="lg">
          <Group justify="space-between" mb="md">
            <div>
              <Text fw={800}>Live queue</Text>
              <Text c="dimmed" size="sm">Operations remain the dominant workspace.</Text>
            </div>
            <QueueStatusBadge scenario={scenario} />
          </Group>
          <MockTicketList />
        </Card>
      </QueueContext>
      <aside className="qacp-command-rail" aria-label="Queue close command center">
        {warningReplaced ? (
          <Paper className="qacp-state-replacement" role="status">
            <StateMessage onRetry={onRetry} scenario={scenario} />
          </Paper>
        ) : (
          <>
            <Paper className="qacp-rail-warning">
              <Text className="qacp-kicker">Main branch · 6:00 PM</Text>
              <ThemeIcon color="red" radius="xl" size={52} variant="light">
                <IconClock size={30} />
              </ThemeIcon>
              <Text fw={900} size="lg">Auto-close in</Text>
              <div aria-atomic="true" aria-live="polite" className="qacp-countdown qacp-countdown-rail">
                {countdown}
              </div>
              <Text c="dimmed" size="sm">
                Extend to 6:30 PM or let the outcome policy run.
              </Text>
              <Divider />
              <ImpactSummary />
              <WarningActions
                disabled={scenario === "denied"}
                onClose={onClose}
                onExtend={onExtend}
                scenario={scenario}
              />
            </Paper>
            <StateMessage onRetry={onRetry} scenario={scenario} />
          </>
        )}
      </aside>
    </div>
  );
}

function VariantC({
  countdown,
  scenario,
  onReview,
  onRetry
}: VariantProps) {
  const warningReplaced = replacesWarningSurface(scenario);
  const compactStatus = scenario === "closed"
    ? "Queue closed"
    : scenario === "reconciling"
      ? "Closing queue"
      : scenario === "error"
        ? "State unconfirmed"
        : `Auto-close ${countdown}`;

  return (
    <QueueContext>
      <Group className="qacp-global-chip-row" justify="space-between">
        <div>
          <Text fw={800}>Live queue</Text>
          <Text c="dimmed" size="sm">Compact status stays available across dashboard sections.</Text>
        </div>
        <Button
          className="qacp-close-chip"
          disabled={warningReplaced}
          leftSection={<IconAlertTriangle size={16} />}
          onClick={warningReplaced ? undefined : onReview}
          variant="light"
        >
          {compactStatus}
        </Button>
      </Group>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card className="qacp-context-card" padding="lg">
          <MockTicketList />
        </Card>
        <Card className="qacp-context-card" padding="lg">
          <Text fw={800}>Why try this</Text>
          <Text c="dimmed" mt="xs" size="sm">
            Lowest page disruption. The compact global status opens a focused bottom-sheet
            decision surface when staff need consequences or actions.
          </Text>
        </Card>
      </SimpleGrid>
      {warningReplaced ? (
        <Paper className="qacp-action-tray qacp-action-tray-state" role="status">
          <StateMessage onRetry={onRetry} scenario={scenario} />
        </Paper>
      ) : (
        <Paper className="qacp-action-tray" role="region" aria-label="Queue auto-close controls">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon color="red" radius="xl" variant="filled">
                <IconClock size={18} />
              </ThemeIcon>
              <div>
                <Text fw={900}>Queue closes in {countdown}</Text>
                <Text className="qacp-tray-detail" size="xs">
                  12 tickets need an outcome
                </Text>
              </div>
            </Group>
            <Button color="red" onClick={onReview}>Review & extend</Button>
          </Group>
        </Paper>
      )}
      {!warningReplaced ? <StateMessage onRetry={onRetry} scenario={scenario} /> : null}
    </QueueContext>
  );
}

function PrototypeSwitcher({
  current,
  onChange
}: {
  current: VariantKey;
  onChange: (variant: VariantKey) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  function cycle(offset: number) {
    const index = VARIANTS.findIndex((variant) => variant.key === current);
    const next = VARIANTS[(index + offset + VARIANTS.length) % VARIANTS.length];
    onChange(next.key);
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const currentName = VARIANTS.find((variant) => variant.key === current)?.name;

  function exitPrototype() {
    const params = new URLSearchParams(location.search);
    params.delete("queueClosePrototype");
    params.delete("variant");
    params.delete("prototypeState");
    const query = params.toString();
    navigate(`${location.pathname}${query ? `?${query}` : ""}`, { replace: true });
  }

  return (
    <div className="qacp-switcher" role="toolbar" aria-label="Prototype variants">
      <Button
        aria-label="Previous prototype variant"
        color="dark"
        onClick={() => cycle(-1)}
        size="compact-sm"
        variant="subtle"
      >
        <IconArrowLeft size={17} />
      </Button>
      <Text className="qacp-switcher-label" fw={900} size="sm">
        {current} — {currentName}
      </Text>
      <Button
        aria-label="Next prototype variant"
        color="dark"
        onClick={() => cycle(1)}
        size="compact-sm"
        variant="subtle"
      >
        <IconArrowRight size={17} />
      </Button>
      <Divider orientation="vertical" />
      <Button color="dark" onClick={exitPrototype} size="compact-sm" variant="subtle">
        Exit
      </Button>
    </div>
  );
}

export default function QueueAutoClosePrototype() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const rawVariant = params.get("variant");
  const rawScenario = params.get("prototypeState");
  const variant: VariantKey = ["A", "B", "C"].includes(rawVariant || "")
    ? rawVariant as VariantKey
    : "A";
  const scenario: ScenarioKey = SCENARIOS.some((item) => item.value === rawScenario)
    ? rawScenario as ScenarioKey
    : "warning";
  const [secondsRemaining, setSecondsRemaining] = useState(() => initialSeconds(scenario));
  const [extendOpen, setExtendOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [liveMessage, setLiveMessage] = useState(
    scenario === "reconnected" ? "Live countdown synchronized from the server." : ""
  );

  function updateParams(changes: Record<string, string>) {
    const next = new URLSearchParams(location.search);
    Object.entries(changes).forEach(([key, value]) => next.set(key, value));
    navigate(`${location.pathname}?${next.toString()}`, { replace: true });
  }

  useEffect(() => {
    setSecondsRemaining(initialSeconds(scenario));
    setLiveMessage(
      scenario === "reconnected" ? "Live countdown synchronized from the server." : ""
    );
  }, [scenario]);

  useEffect(() => {
    if (!["warning", "extended", "denied", "reconnected"].includes(scenario)) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setSecondsRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          updateParams({ prototypeState: "reconciling" });
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [scenario]);

  if (!import.meta.env.DEV) return null;

  const countdown = formatCountdown(secondsRemaining);

  function confirmExtension() {
    setExtendOpen(false);
    setDetailOpen(false);
    setLiveMessage("Auto-close cancelled. Queue extended by 30 minutes.");
    updateParams({ prototypeState: "extended" });
  }

  function confirmClose() {
    setCloseOpen(false);
    setDetailOpen(false);
    setLiveMessage("Queue closed. Ticket outcomes were reconciled.");
    updateParams({ prototypeState: "closed" });
  }

  const variantProps: VariantProps = {
    countdown,
    scenario,
    onClose: () => setCloseOpen(true),
    onExtend: () => setExtendOpen(true),
    onRetry: () => {
      setLiveMessage("Live queue state restored.");
      updateParams({ prototypeState: "reconnected" });
    },
    onReview: () => setDetailOpen(true)
  };

  return (
    <Box className={`qacp-root qacp-variant-${variant.toLowerCase()}`}>
      <Paper className="qacp-prototype-heading" p="md" radius="lg" withBorder>
        <Group justify="space-between" align="flex-end">
          <div>
            <Text className="qacp-prototype-label">Throwaway interaction prototype</Text>
            <Title order={2}>{VARIANTS.find((item) => item.key === variant)?.name}</Title>
          </div>
          <Select
            aria-label="Prototype scenario"
            data={SCENARIOS}
            label="Scenario"
            onChange={(value) => value && updateParams({ prototypeState: value })}
            value={scenario}
          />
        </Group>
      </Paper>

      <div aria-atomic="true" aria-live="polite" className="qacp-live-region">
        {liveMessage}
      </div>

      {variant === "A" ? <VariantA {...variantProps} /> : null}
      {variant === "B" ? <VariantB {...variantProps} /> : null}
      {variant === "C" ? <VariantC {...variantProps} /> : null}

      <Modal
        centered
        classNames={{
          body: "qacp-modal-body",
          content: "qacp-modal-content",
          header: "qacp-modal-header"
        }}
        onClose={() => setExtendOpen(false)}
        opened={extendOpen}
        size="lg"
        title={
          <div>
            <Text className="qacp-kicker">Queue extension</Text>
            <Title order={2}>Extend Main branch by 30 minutes?</Title>
          </div>
        }
      >
        <Stack gap="md">
          <Text>
            Auto-close moves from 6:00 PM to 6:30 PM. Intake remains open and a new
            warning begins at 6:15 PM.
          </Text>
          <ImpactSummary />
          <Alert color="blue" icon={<IconClock size={18} />}>
            This action is recorded with your account and may be repeated during the next warning.
          </Alert>
          <Group className="qacp-modal-actions" justify="flex-end">
            <Button onClick={() => setExtendOpen(false)} variant="subtle">Keep current close</Button>
            <Button className="qacp-extend-button" onClick={confirmExtension}>
              Confirm 30-minute extension
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        centered
        classNames={{
          body: "qacp-modal-body",
          content: "qacp-modal-content",
          header: "qacp-modal-header"
        }}
        onClose={() => setCloseOpen(false)}
        opened={closeOpen}
        size="lg"
        title={
          <div>
            <Text className="qacp-kicker">Manual close</Text>
            <Title order={2}>Close Main branch now?</Title>
          </div>
        }
      >
        <Stack gap="md">
          <Text>Closing is immediate and applies these ticket outcomes:</Text>
          <ImpactSummary />
          <Alert color="red" icon={<IconAlertTriangle size={18} />}>
            Reopening later will not reverse ticket outcomes or recall carry-over.
          </Alert>
          <Group className="qacp-modal-actions" justify="flex-end">
            <Button onClick={() => setCloseOpen(false)} variant="subtle">Keep queue open</Button>
            <Button color="red" onClick={confirmClose}>Close queue now</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        classNames={{
          body: "qacp-modal-body",
          content: "qacp-modal-content qacp-detail-sheet",
          header: "qacp-modal-header"
        }}
        onClose={() => setDetailOpen(false)}
        opened={detailOpen}
        size="lg"
        title={
          <div>
            <Text className="qacp-kicker">Auto-close warning</Text>
            <Title order={2}>Main branch closes in {countdown}</Title>
          </div>
        }
      >
        <Stack gap="md">
          <Text>If no one extends the queue, the outcome policy runs at 6:00 PM.</Text>
          <ImpactSummary />
          <StateMessage
            onRetry={() => updateParams({ prototypeState: "reconnected" })}
            scenario={scenario}
          />
          <div className="qacp-detail-actions">
            <WarningActions
              disabled={scenario === "denied"}
              onClose={() => {
                setDetailOpen(false);
                setCloseOpen(true);
              }}
              onExtend={() => {
                setDetailOpen(false);
                setExtendOpen(true);
              }}
              scenario={scenario}
            />
          </div>
        </Stack>
      </Modal>

      <PrototypeSwitcher
        current={variant}
        onChange={(nextVariant) => updateParams({ variant: nextVariant })}
      />
    </Box>
  );
}
