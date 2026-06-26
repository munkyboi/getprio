import { useEffect, useState, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Container,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title
} from "@mantine/core";
import {
  IconBellRinging,
  IconChartBar,
  IconCheck,
  IconClockHour4,
  IconMail,
  IconMessageCircle,
  IconPhone,
  IconQrcode,
  IconUsersGroup
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { Link, useLocation } from "react-router-dom";
import type { EnterpriseInquiryRequest, EnterpriseInquiryResponse } from "@shared";
import { apiRequest } from "../api/client";
import { getErrorMessage } from "../utils/errors";

const services = [
  {
    icon: IconQrcode,
    title: "Customer entry",
    text: "Guests join from their phones in seconds, without crowding the counter."
  },
  {
    icon: IconClockHour4,
    title: "Live public boards",
    text: "Waiting rooms and service counters stay in sync on a clear shared display."
  },
  {
    icon: IconBellRinging,
    title: "Near-turn alerts",
    text: "Customers get timely updates while staff keep the line moving."
  },
  {
    icon: IconChartBar,
    title: "Vendor workspace",
    text: "Managers see queues, wait times, and service trends from one dashboard."
  }
] as const;

const steps = [
  "Scan to join",
  "See your place",
  "Get alerted",
  "Get served"
] as const;

const pricingPlans = [
  {
    name: "Economical",
    price: "PHP 499/mo",
    bestFor: "Solo vendors and small shops",
    art: "/illustrations/generated/pricing-economical-transparent.png",
    features: ["1 location", "QR join page", "Public board", "500 tickets/mo"],
    highlight: false
  },
  {
    name: "Pro",
    price: "PHP 1,499/mo",
    bestFor: "Growing clinics and busy teams",
    art: "/illustrations/generated/pricing-pro-transparent.png",
    features: ["3 locations", "Branded pages", "Analytics", "300 SMS/mo"],
    highlight: true
  },
  {
    name: "Enterprise",
    price: "PHP 6,999+/mo",
    bestFor: "Multi-branch operations",
    art: "/illustrations/generated/pricing-enterprise-transparent.png",
    features: ["10+ locations", "Advanced roles", "SLA support", "Custom rollout"],
    highlight: false
  }
] as const;

export default function LandingPage() {
  const location = useLocation();
  const [enterpriseDialogOpen, setEnterpriseDialogOpen] = useState(false);
  const [enterpriseForm, setEnterpriseForm] = useState<EnterpriseInquiryRequest>({
    businessName: "",
    contactName: "",
    email: "",
    phone: "",
    message: ""
  });
  const [enterpriseError, setEnterpriseError] = useState("");
  const [enterpriseSubmitting, setEnterpriseSubmitting] = useState(false);

  useEffect(() => {
    if (!location.hash) {
      return;
    }

    const section = document.querySelector(location.hash);
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash]);

  async function handleEnterpriseSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEnterpriseSubmitting(true);
    setEnterpriseError("");

    try {
      await apiRequest<EnterpriseInquiryResponse, EnterpriseInquiryRequest>(
        "/public/enterprise-inquiries",
        {
          method: "POST",
          body: enterpriseForm
        }
      );
      notifications.show({
        color: "teal",
        icon: <IconCheck size={18} />,
        message: "We sent your request to the GetPrio platform team.",
        title: "Enterprise request sent"
      });
      setEnterpriseForm({
        businessName: "",
        contactName: "",
        email: "",
        phone: "",
        message: ""
      });
    } catch (submitError) {
      setEnterpriseError(getErrorMessage(submitError));
    } finally {
      setEnterpriseSubmitting(false);
    }
  }

  return (
    <Stack gap={0}>
      <Box className="prio-hero" id="product">
        <Container size="xl">
          <SimpleGrid className="prio-hero-grid" cols={{ base: 1, md: 2 }} spacing={{ base: 36, md: 24 }} verticalSpacing="xl">
            <Stack justify="center" gap="xl">
              <Stack gap="md">
                <Title className="prio-display" order={1}>
                  Queues that move before customers get restless.
                </Title>
                <Text className="prio-lead">
                  GetPrio keeps every wait predictable with QR entry, live public boards,
                  near-turn alerts, and vendor tools built for busy service teams.
                </Text>
              </Stack>
              <Group gap="md">
                <Button component={Link} to="/register/vendor" color="orange" size="lg">
                  Start free
                </Button>
                <Button component={Link} to="/vendors" size="lg" variant="outline" color="dark">
                  Browse vendors
                </Button>
              </Group>
              <SimpleGrid className="prio-mini-proof" cols={{ base: 1, sm: 3 }}>
                {services.slice(0, 3).map((service) => {
                  const Icon = service.icon;
                  return (
                    <Group gap="sm" key={service.title} wrap="nowrap">
                      <ThemeIcon color="orange" radius="xl" size={40} variant="light">
                        <Icon size={20} />
                      </ThemeIcon>
                      <Text fw={700} size="sm">{service.title}</Text>
                    </Group>
                  );
                })}
              </SimpleGrid>
            </Stack>

            <Box className="prio-hero-art-wrap">
              <img
                alt="Illustration of customers joining and waiting in a GetPrio queue"
                className="prio-hero-art"
                src="/illustrations/generated/hero-queue-scene-transparent.png"
              />
              <Paper className="prio-dashboard-preview" p="lg">
                <Text fw={800}>Good morning, Emma 👋</Text>
                <Text c="dimmed" size="sm">Here&apos;s what&apos;s happening today.</Text>
                <SimpleGrid cols={2} mt="md" spacing="sm">
                  <div className="prio-dashboard-tile">
                    <Text c="dimmed" size="xs">Now serving</Text>
                    <Text className="prio-dashboard-number">A012</Text>
                  </div>
                  <div className="prio-dashboard-tile">
                    <Text c="dimmed" size="xs">Average wait</Text>
                    <Text fw={800}>18 min</Text>
                  </div>
                </SimpleGrid>
              </Paper>
            </Box>
          </SimpleGrid>
        </Container>
      </Box>

      <Box className="prio-section" id="solutions">
        <Container size="xl">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing={{ base: 32, md: 64 }}>
            <Stack gap="xl">
                <div>
                  <Text className="prio-label">Features</Text>
                  <Title className="prio-section-title" order={2}>
                  One live system across every screen.
                  </Title>
                </div>
              <Stack gap={0}>
                {services.map((service) => {
                  const Icon = service.icon;
                  return (
                    <Group className="prio-feature-row" key={service.title} wrap="nowrap">
                      <ThemeIcon color="orange" radius="xl" size={46} variant="light">
                        <Icon size={22} />
                      </ThemeIcon>
                      <div>
                        <Text fw={800}>{service.title}</Text>
                        <Text c="dimmed">{service.text}</Text>
                      </div>
                    </Group>
                  );
                })}
              </Stack>
            </Stack>

              <img
              alt="Illustration of GetPrio across a customer phone, public queue board, and vendor dashboard"
                className="prio-feature-art"
              src="/illustrations/generated/features-ecosystem-transparent.png"
              />
          </SimpleGrid>
        </Container>
      </Box>

      <Box className="prio-dark-band">
        <Container size="xl">
          <Stack gap="xl">
            <div>
              <Text className="prio-label prio-label-light">Workflow</Text>
              <Title c="white" className="prio-section-title" order={2}>
                From scan to served in four live steps.
              </Title>
            </div>
            <img
              alt="Four-step queue journey from scan to service"
              className="prio-workflow-art"
              src="/illustrations/generated/workflow-strip.png"
            />
            <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
              {steps.map((step, index) => (
                <Group className="prio-step" gap="md" key={step} wrap="nowrap">
                  <ThemeIcon color="orange" radius="xl" size={34} variant="filled">
                    {index + 1}
                  </ThemeIcon>
                  <Text c="white" fw={800}>{step}</Text>
                </Group>
              ))}
            </SimpleGrid>
          </Stack>
        </Container>
      </Box>

      <Box className="prio-section" id="pricing">
        <Container size="xl">
          <Stack gap="xl">
            <div className="prio-centered-copy">
              <Text className="prio-label">Pricing</Text>
              <Title className="prio-section-title" order={2}>
                Choose the rhythm that fits your operation.
              </Title>
            </div>
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
              {pricingPlans.map((plan) => (
                <Paper
                  className={plan.highlight ? "prio-pricing-card prio-pricing-card-featured" : "prio-pricing-card"}
                  key={plan.name}
                  p="xl"
                >
                  <Stack gap="lg" h="100%">
                    <img alt="" className="prio-plan-art" src={plan.art} />
                    <div>
                      <Title order={3}>{plan.name}</Title>
                      <Text className="prio-price">{plan.price}</Text>
                      <Text c="dimmed">{plan.bestFor}</Text>
                    </div>
                    <Stack gap="xs">
                      {plan.features.map((feature) => (
                        <Group gap="sm" key={feature} wrap="nowrap">
                          <ThemeIcon color={plan.highlight ? "orange" : "dark"} radius="xl" size={22} variant="light">
                            <IconCheck size={14} />
                          </ThemeIcon>
                          <Text size="sm">{feature}</Text>
                        </Group>
                      ))}
                    </Stack>
                    {plan.name === "Enterprise" ? (
                      <Button color="dark" mt="auto" onClick={() => setEnterpriseDialogOpen(true)} variant="outline">
                        Request setup
                      </Button>
                    ) : (
                      <Button
                        color={plan.highlight ? "orange" : "dark"}
                        component={Link}
                        mt="auto"
                        to="/register/vendor"
                        variant={plan.highlight ? "filled" : "outline"}
                      >
                        Choose plan
                      </Button>
                    )}
                  </Stack>
                </Paper>
              ))}
            </SimpleGrid>
          </Stack>
        </Container>
      </Box>

      <Box className="prio-cta-section">
        <Container size="xl">
          <Paper className="prio-cta" p={{ base: "xl", md: 48 }}>
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing={{ base: 28, md: 40 }}>
              <Stack justify="center" gap="md">
                <ThemeIcon color="orange" radius="xl" size={58} variant="light">
                  <IconUsersGroup size={30} />
                </ThemeIcon>
                <Title className="prio-section-title" order={2}>
                  Ready to run a calmer queue?
                </Title>
                <Text c="dimmed">
                  Start with a vendor workspace, publish your first public board, and let the line
                  breathe a little easier.
                </Text>
                <Group>
                  <Button component={Link} to="/register/vendor" color="orange" size="lg">
                    Get started
                  </Button>
                  <Button component={Link} to="/vendors" size="lg" variant="outline" color="dark">
                    Browse vendors
                  </Button>
                </Group>
              </Stack>
              <img
                alt="Illustration of a calm service queue"
                className="prio-cta-art"
                src="/illustrations/generated/cta-queue-scene-transparent.png"
              />
            </SimpleGrid>
          </Paper>
        </Container>
      </Box>

      <Modal
        centered
        classNames={{
          body: "enterprise-contact-modal-body",
          content: "enterprise-contact-modal",
          header: "enterprise-contact-modal-header",
          title: "enterprise-contact-modal-title"
        }}
        opened={enterpriseDialogOpen}
        onClose={() => setEnterpriseDialogOpen(false)}
        size={1180}
        title="Enterprise consultation"
      >
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing={0}>
          <Stack className="enterprise-contact-panel" gap="xl" p={{ base: "xl", md: 48 }}>
            <div>
              <Text className="finazze-section-label finazze-section-label-light">Contact us</Text>
              <Title c="white" order={2} mt="sm">
                Your Enterprise queue rollout starts with a conversation.
              </Title>
              <Text c="rgba(255,255,255,0.72)" mt="md">
                Tell us about your locations, expected queue volume, and support needs. We will
                route your request to the GetPrio platform team.
              </Text>
            </div>
            <Stack gap="md">
              {[
                { icon: IconMessageCircle, label: "Response", value: "Setup consultation" },
                { icon: IconMail, label: "Sent to", value: "Platform settings email" },
                { icon: IconPhone, label: "Best for", value: "Multi-branch operations" }
              ].map(({ icon: Icon, label, value }) => (
                <Group className="enterprise-contact-info-row" key={label} wrap="nowrap">
                  <ThemeIcon color="orange" radius="xl" size={44} variant="filled">
                    <Icon size={22} />
                  </ThemeIcon>
                  <div>
                    <Text c="rgba(255,255,255,0.58)" size="sm">{label}</Text>
                    <Text c="white" fw={800}>{value}</Text>
                  </div>
                </Group>
              ))}
            </Stack>
          </Stack>

          <Box p={{ base: "xl", md: 48 }}>
            <form onSubmit={handleEnterpriseSubmit}>
              <Stack gap="lg">
                <div>
                  <Text className="finazze-section-label">Send request</Text>
                  <Title order={3} mt={6}>Tell us what you need.</Title>
                </div>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" verticalSpacing="lg">
                  <TextInput
                    name="businessName"
                    label="Business name"
                    required
                    size="lg"
                    value={enterpriseForm.businessName}
                    onChange={(event) =>
                      setEnterpriseForm((current) => ({ ...current, businessName: event.target.value }))
                    }
                  />
                  <TextInput
                    name="contactName"
                    label="Contact name"
                    required
                    size="lg"
                    value={enterpriseForm.contactName}
                    onChange={(event) =>
                      setEnterpriseForm((current) => ({ ...current, contactName: event.target.value }))
                    }
                  />
                  <TextInput
                    name="email"
                    label="Email"
                    required
                    size="lg"
                    type="email"
                    value={enterpriseForm.email}
                    onChange={(event) =>
                      setEnterpriseForm((current) => ({ ...current, email: event.target.value }))
                    }
                  />
                  <TextInput
                    name="phone"
                    label="Phone"
                    size="lg"
                    value={enterpriseForm.phone}
                    onChange={(event) =>
                      setEnterpriseForm((current) => ({ ...current, phone: event.target.value }))
                    }
                  />
                </SimpleGrid>
                <Textarea
                  name="message"
                  label="Message"
                  minRows={6}
                  placeholder="Tell us about branches, expected queue volume, or support needs."
                  size="lg"
                  value={enterpriseForm.message}
                  onChange={(event) =>
                    setEnterpriseForm((current) => ({ ...current, message: event.target.value }))
                  }
                />
                {enterpriseError ? <Alert color="red">{enterpriseError}</Alert> : null}
                <Group justify="space-between">
                  <Text c="dimmed" size="sm">We only use this to respond to your Enterprise request.</Text>
                  <Group>
                    <Button size="md" variant="default" onClick={() => setEnterpriseDialogOpen(false)}>
                      Close
                    </Button>
                    <Button color="dark" disabled={enterpriseSubmitting} size="md" type="submit">
                      {enterpriseSubmitting ? "Sending..." : "Send request"}
                    </Button>
                  </Group>
                </Group>
              </Stack>
            </form>
          </Box>
        </SimpleGrid>
      </Modal>
    </Stack>
  );
}
