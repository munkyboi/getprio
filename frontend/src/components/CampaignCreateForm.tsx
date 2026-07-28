import { useEffect, useState, type FormEvent } from "react";
import { Alert, Badge, Button, Divider, Group, NumberInput, Paper, ScrollArea, Slider, Stack, Text, TextInput, Title } from "@mantine/core";
import type { CustomerBookingDetailResponse, OrganizerCampaign } from "@shared";
import { customerAccountApi } from "../api/customerAccount";
import { getErrorMessage } from "../utils/errors";
import CampaignDescriptionEditor from "./CampaignDescriptionEditor";
import CampaignDeadlinePicker, { formatCampaignDeadline } from "./CampaignDeadlinePicker";

type CampaignBooking = CustomerBookingDetailResponse["booking"];

export default function CampaignCreateForm({
  booking,
  modal = false,
  token,
  onCancel,
  onCreated
}: {
  booking: CampaignBooking;
  modal?: boolean;
  token: string;
  onCancel?: () => void;
  onCreated: (campaign: OrganizerCampaign) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadlineAt, setDeadlineAt] = useState("");
  const [fee, setFee] = useState<number | string>(500);
  const [contributors, setContributors] = useState<number | string>(2);
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const contributorCount = Number(contributors) || 1;
  const contributionFeeCents = Math.round((Number(fee) || 0) * 100);
  const collectionTargetCents = contributionFeeCents * contributorCount;
  const bookingTotalCents = booking.bundleItems?.length
    ? booking.bundleItems.reduce((total, item) => total + Number(item.priceAmountCents || 0), 0)
    : Number(booking.servicePriceAmountCents || 0) * Number(booking.bookingQuantity || 1);
  const formatMoney = (cents: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: booking.serviceCurrency || "PHP" }).format(cents / 100);
  const deadlineLabel = deadlineAt ? formatCampaignDeadline(deadlineAt) || "Not set" : "Not set";

  useEffect(() => {
    setTitle(`${booking.serviceName} group booking`);
  }, [booking.id, booking.serviceName]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await customerAccountApi.createCampaign(token, {
        bookingId: booking.id,
        title,
        description,
        deadlineAt,
        contributionFeeCents: Math.round(Number(fee) * 100),
        requiredContributors: Number(contributors),
        paymentInstructions: instructions
      });
      onCreated(data.campaign);
    } catch (next) {
      setError(getErrorMessage(next));
    } finally {
      setBusy(false);
    }
  }

  const fields = <Stack gap="md">
      {!modal ? <div><Text className="finazze-section-label">CAMPAIGN SETUP</Text><Title order={2}>Create campaign</Title></div> : null}
      <Text c="dimmed" size="sm">Your booking remains paid and confirmed regardless of the campaign outcome. You collect contributions directly.</Text>
      <Alert color="teal" variant="light">{booking.serviceName} · {new Date(booking.scheduledStartAt).toLocaleString()}</Alert>
      {error ? <Alert color="red">{error}</Alert> : null}
      <TextInput required label="Campaign title" maxLength={120} value={title} onChange={(event) => setTitle(event.currentTarget.value)}/>
      <Stack gap={4}><Text fw={500} size="sm">Description</Text><CampaignDescriptionEditor disabled={busy} onChange={setDescription} value={description}/></Stack>
      <CampaignDeadlinePicker disabled={busy} onChange={setDeadlineAt} scheduledStartAt={booking.scheduledStartAt} value={deadlineAt}/>
      <NumberInput required label="Contribution fee per person (PHP)" min={1} value={fee} onChange={setFee}/>
      <Stack gap={6}><Group justify="space-between"><Text fw={500} size="sm">Number of contributors <Text c="red" component="span">*</Text></Text><Badge color="orange" variant="light">{contributorCount} people</Badge></Group><Slider aria-label="Number of contributors" className="booking-value-slider" label={(value) => `${value} contributors`} max={100} min={1} onChange={setContributors} step={1} value={contributorCount}/><Group className="booking-slider-bounds" justify="space-between"><Text c="dimmed" size="xs">Min 1</Text><Text c="dimmed" size="xs">Max 100</Text></Group></Stack>
      <Stack gap={4}><Text fw={500} size="sm">Private payment instructions <Text c="red" component="span">*</Text></Text><Text c="dimmed" size="xs">Shown only to joined, signed-in contributors.</Text><CampaignDescriptionEditor disabled={busy} maxCharacters={2000} onChange={setInstructions} value={instructions}/></Stack>
      <Paper className="campaign-create-summary" p="md" radius="lg" withBorder><Stack gap="sm"><Group justify="space-between"><div><Text className="finazze-section-label">CAMPAIGN BREAKDOWN</Text><Title order={3}>Review your setup</Title></div><Badge color="gray" variant="light">Draft</Badge></Group><Divider/><Group justify="space-between"><Text c="dimmed" size="sm">Booking paid to vendor</Text><Text fw={700}>{formatMoney(bookingTotalCents)}</Text></Group><Group justify="space-between"><Text c="dimmed" size="sm">Contribution calculation</Text><Text fw={700}>{formatMoney(contributionFeeCents)} × {contributorCount}</Text></Group><Group className="campaign-create-summary__total" justify="space-between"><Text fw={800}>Collection target</Text><Text fw={900}>{formatMoney(collectionTargetCents)}</Text></Group><Group justify="space-between"><Text c="dimmed" size="sm">Campaign deadline</Text><Text fw={700} size="sm" ta="right">{deadlineLabel}</Text></Group><Text c="dimmed" size="xs">You collect contributions directly. GetPrio does not receive contributor funds, and this campaign does not change your paid, confirmed booking.</Text></Stack></Paper>
    </Stack>;
  const actions = (insideModal = false) => <Group className={`${insideModal ? "customer-modal-actions " : ""}campaign-create-form__actions`} justify="flex-end">
        {onCancel ? <Button className="campaign-create-form__cancel" disabled={busy} onClick={onCancel} variant="default">Cancel</Button> : null}
        <Button loading={busy} type="submit">Create draft campaign</Button>
      </Group>;

  if (modal) {
    return <form className="campaign-create-form campaign-create-form--modal" onSubmit={submit}>
      <div className="campaign-create-form__shell">
        <ScrollArea className="campaign-create-form__main" offsetScrollbars scrollbars="y" scrollbarSize={10} type="always">
          <div className="campaign-create-form__content">{fields}</div>
        </ScrollArea>
        {actions(true)}
      </div>
    </form>;
  }

  return <form className="campaign-create-form" onSubmit={submit}><Stack gap="md">{fields}{actions()}</Stack></form>;
}
