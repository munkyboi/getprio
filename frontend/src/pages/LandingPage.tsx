import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Container,
  Group,
  Modal,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title
} from "@mantine/core";
import {
  IconArrowDown,
  IconArrowRight,
  IconArrowUpRight,
  IconAsterisk,
  IconBellRinging,
  IconBrandAndroid,
  IconBrandApple,
  IconChartBar,
  IconCheck,
  IconClockHour4,
  IconMail,
  IconMessageCircle,
  IconPhone,
  IconQrcode,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { Link, useLocation } from "react-router-dom";
import type { BillingOverviewResponse, EnterpriseInquiryRequest, EnterpriseInquiryResponse, SubscriptionPlan } from "@shared";
import PhilippineMobileInput from "../components/PhilippineMobileInput";
import { apiRequest } from "../api/client";
import { getErrorMessage } from "../utils/errors";
import { getPlanPriceDisplay } from "../utils/subscriptionPlans";
import PricingHighlights from "./PricingHighlights";

import WorkflowSpotlight from "./WorkflowSpotlight";
import LandingRibbons from "./LandingRibbons";
import HeroPhones from "./HeroPhones";
import ConnectedScreensParallax from "./ConnectedScreensParallax";
import { useLandingMotion } from "./useLandingMotion";
import { usePricingMagnet } from "./usePricingMagnet";
import "./LandingPageMotion.css";

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

const planArt: Record<SubscriptionPlan["slug"], string> = {
  free: "/illustrations/generated/pricing-economical-transparent.png",
  economical: "/illustrations/generated/pricing-economical-transparent.png",
  pro: "/illustrations/generated/pricing-pro-transparent.png",
  enterprise: "/illustrations/generated/pricing-enterprise-transparent.png"
};

const monthlyPriceFormatter = new Intl.NumberFormat("en-PH", {
  maximumFractionDigits: 2
});
const enterpriseMessageMaxLength = 1000;
const iOSAppStoreUrl = import.meta.env.VITE_GETPRIO_IOS_APP_STORE_URL?.trim();

export default function LandingPage() {
  const location = useLocation();
  const [enterpriseDialogOpen, setEnterpriseDialogOpen] = useState(false);
  const [enterpriseForm, setEnterpriseForm] = useState<EnterpriseInquiryRequest>({
    businessName: "",
    contactName: "",
    email: "",
    phone: "",
    message: "",
    honeypot: "",
    turnstileToken: ""
  });
  const [enterpriseError, setEnterpriseError] = useState("");
  const [enterpriseSubmitting, setEnterpriseSubmitting] = useState(false);
  const [pricingPlans, setPricingPlans] = useState<SubscriptionPlan[]>([]);
  const [pricingExpanded, setPricingExpanded] = useState(false);
  const [pricingError, setPricingError] = useState("");
  const landingRoot = useRef<HTMLDivElement>(null);
  useLandingMotion(landingRoot, pricingPlans.length);
  usePricingMagnet(landingRoot, pricingPlans.length);
  const enterpriseTurnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const enterpriseTurnstileWidgetIdRef = useRef<string | null>(null);
  const enterpriseSubmissionPendingRef = useRef(false);
  const [enterpriseTurnstileReady, setEnterpriseTurnstileReady] = useState(false);
  const enterpriseTurnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
  const shouldUseEnterpriseTurnstile = Boolean(enterpriseTurnstileSiteKey);

  useEffect(() => {
    apiRequest<BillingOverviewResponse>("/billing/plans")
      .then((data) => setPricingPlans(data.plans))
      .catch(() => setPricingError("Pricing is temporarily unavailable. Please try again shortly."));
  }, []);

  useEffect(() => {
    if (!location.hash) {
      return;
    }

    const section = document.querySelector(location.hash);
    section?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  }, [location.hash]);

  useEffect(() => {
    if (!enterpriseDialogOpen) {
      return undefined;
    }

    setEnterpriseForm((current) => ({ ...current, turnstileToken: "" }));
    if (!shouldUseEnterpriseTurnstile) {
      setEnterpriseTurnstileReady(true);
      return undefined;
    }

    let active = true;
    setEnterpriseTurnstileReady(false);
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
    );

    function renderTurnstile() {
      if (
        !active ||
        !enterpriseTurnstileContainerRef.current ||
        !window.turnstile ||
        enterpriseTurnstileWidgetIdRef.current
      ) {
        return;
      }

      enterpriseTurnstileWidgetIdRef.current = window.turnstile.render(
        enterpriseTurnstileContainerRef.current,
        {
          sitekey: enterpriseTurnstileSiteKey,
          callback: (token) => {
            setEnterpriseForm((current) => ({ ...current, turnstileToken: token }));
            setEnterpriseTurnstileReady(true);
          },
          "expired-callback": () => {
            setEnterpriseForm((current) => ({ ...current, turnstileToken: "" }));
            setEnterpriseTurnstileReady(false);
          },
          "error-callback": () => {
            setEnterpriseForm((current) => ({ ...current, turnstileToken: "" }));
            setEnterpriseTurnstileReady(false);
            setEnterpriseError("Verification could not load. Please refresh and try again.");
          }
        }
      );
    }

    if (window.turnstile) {
      renderTurnstile();
    } else if (existingScript) {
      existingScript.addEventListener("load", renderTurnstile, { once: true });
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", renderTurnstile, { once: true });
      document.head.appendChild(script);
    }

    return () => {
      active = false;
      existingScript?.removeEventListener("load", renderTurnstile);
      if (enterpriseTurnstileWidgetIdRef.current && window.turnstile) {
        window.turnstile.remove(enterpriseTurnstileWidgetIdRef.current);
        enterpriseTurnstileWidgetIdRef.current = null;
      }
    };
  }, [enterpriseDialogOpen, enterpriseTurnstileSiteKey, shouldUseEnterpriseTurnstile]);

  function resetEnterpriseTurnstile() {
    setEnterpriseForm((current) => ({ ...current, turnstileToken: "" }));
    if (enterpriseTurnstileWidgetIdRef.current && window.turnstile) {
      setEnterpriseTurnstileReady(false);
      window.turnstile.reset(enterpriseTurnstileWidgetIdRef.current);
    }
  }

  async function handleEnterpriseSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enterpriseSubmissionPendingRef.current) {
      return;
    }
    if (shouldUseEnterpriseTurnstile && !enterpriseForm.turnstileToken) {
      setEnterpriseError("Complete the security check before sending your request.");
      return;
    }

    enterpriseSubmissionPendingRef.current = true;
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
        message: "",
        honeypot: "",
        turnstileToken: ""
      });
    } catch (submitError) {
      setEnterpriseError(getErrorMessage(submitError));
    } finally {
      enterpriseSubmissionPendingRef.current = false;
      setEnterpriseSubmitting(false);
      resetEnterpriseTurnstile();
    }
  }

  return (
    <Stack gap={0} ref={landingRoot} className="lp-page">
      <LandingRibbons />
      <section className="lp-hero" id="product">
        <div className="lp-container lp-hero-grid">
          <div className="lp-hero-content">
            <p className="lp-eyebrow"><span className="lp-dot" /> LESS WAITING. MORE LIVING.</p>
            <h1 className="lp-title">
              <span className="lp-hero-line"><span>Your day.</span></span>
              <span className="lp-hero-line"><span>Your pace.</span></span>
              <span className="lp-hero-line"><span><em>Your priority.</em></span></span>
            </h1>
            <p className="lp-hero-copy">Life happens beyond the line. Join a queue, follow your place, and get a heads-up when it’s your turn.</p>
            <div className="lp-hero-actions">
              <Button className="customer-primary-action" component={Link} to="/vendors" color="dark" size="lg" radius="xl">Find your next stop <IconArrowUpRight size={22} stroke={1.5} aria-hidden="true" /></Button>
              <a className="lp-text-link" href="#workflow">See how it works <IconArrowDown size={14} aria-hidden="true" /></a>
            </div>
            <div className="lp-app-links">
              <Button component="a" disabled={!iOSAppStoreUrl} href={iOSAppStoreUrl || undefined} target="_blank" rel="noreferrer" variant="subtle" color="dark" leftSection={<IconBrandApple size={20} />}>{iOSAppStoreUrl ? 'Get the iOS app' : 'iOS download coming soon'}</Button>
              <span><IconBrandAndroid size={17} aria-hidden="true" /> Android — coming soon</span>
            </div>
          </div>
          <div className="lp-hero-visual" id="get-the-app">
            <div className="lp-orbit-caption" aria-hidden="true">MAKE ROOM FOR YOUR DAY</div>
            <HeroPhones />
            <div className="lp-float-note lp-note-top"><IconQrcode size={22} /><span>A quick scan.<br /><strong>And you’re in.</strong></span></div>
            <div className="lp-float-note lp-note-bottom"><IconBellRinging size={22} /><span>Go live your day.<br /><strong>We’ll keep your place in view.</strong></span></div>
          </div>
        </div>
        <div className="lp-hero-footer lp-container"><span>FOR EVERYDAY PLACES. AND EVERYONE IN THEM.</span><a href="#solutions">EXPLORE GETPRIO <IconArrowDown size={14} aria-hidden="true" /></a></div>
      </section>

      <section className="lp-manifesto" aria-labelledby="lp-manifesto-title">
        <div className="lp-container">
          <p className="lp-eyebrow" data-reveal>01 / A BETTER KIND OF WAIT</p>
          <h2 id="lp-manifesto-title">{'A coffee. A conversation. A moment to yourself.'.split(' ').map((word, i) => <span className="lp-manifesto-word" key={i}>{word} </span>)}<em>{'There’s more to your day than waiting.'.split(' ').map((word, i) => <span className="lp-manifesto-word" key={i}>{word} </span>)}</em></h2>
          <div className="lp-manifesto-bottom"><IconAsterisk className="lp-asterisk" size={65} stroke={1} aria-hidden="true" /><p data-reveal>We give people a clearer wait.<br />And service teams a calmer way to work.</p></div>
        </div>
      </section>

      <section className="lp-features" id="solutions">
        <div className="lp-container">
          <div className="lp-section-rule" />
          <header className="lp-section-head" data-reveal><p className="lp-eyebrow">02 / CONNECTED BY DESIGN</p><h2>One rhythm.<br /><em>Every screen.</em></h2><p>From the phone in your hand to the team behind the counter. Everyone sees what’s next.</p></header>
          <div className="lp-feature-stage">
            <span className="lp-stage-label">THE WHOLE QUEUE, IN SYNC</span>
            <ConnectedScreensParallax />
            <div className="lp-stage-foot"><span>THE PUBLIC BOARD</span><span>YOUR PHONE</span><span>YOUR TEAM</span></div>
          </div>
          <div className="lp-feature-list">{services.map((service, index) => {
            const Icon = service.icon;
            return <article className="lp-feature" key={service.title}><span className="lp-feature-number">0{index + 1}</span><Icon size={26} stroke={1.5} /><h3>{service.title}</h3><p>{service.text}</p></article>;
          })}</div>
        </div>
      </section>

      <WorkflowSpotlight />

      <Box className="prio-section lp-pricing" id="pricing">
        <Container size="xl">
          <Stack gap="xl">
            <div className="prio-centered-copy" data-reveal>
              <Text className="prio-label">04 / ROOM TO GROW</Text>
              <Title className="prio-section-title" order={2}>
                A calmer day. At every scale.
              </Title>
            </div>
            {pricingError ? <Alert color="red">{pricingError}</Alert> : null}
            <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }} spacing="lg">
              {pricingPlans.map((plan) => (
                <Paper
                  className={plan.slug === "pro" ? "prio-pricing-card prio-pricing-card-featured" : "prio-pricing-card"}
                  key={plan.slug}
                  p="xl"
                >
                  <Stack gap="lg" h="100%">
                    <img alt="" className="prio-plan-art" src={planArt[plan.slug]} />
                    <div>
                      <Title order={3}>{plan.name}</Title>
                      <div
                        aria-label={getPlanPriceDisplay(plan)}
                        className="prio-price"
                      >
                        {plan.slug === "enterprise" ? (
                          <Text className="prio-price-prefix">Starts at {plan.price.currency}</Text>
                        ) : (
                          <Text className="prio-price-currency">{plan.price.currency}</Text>
                        )}
                        <div className="prio-price-line">
                          <span className="prio-price-amount">
                            {monthlyPriceFormatter.format(plan.price.monthlyAmountCents / 100)}
                          </span>
                          <span className="prio-price-period">/mo</span>
                        </div>
                      </div>
                      <Text c="dimmed">{plan.bestFor}</Text>
                    </div>
                    <PricingHighlights
                      plan={plan}
                      expanded={pricingExpanded}
                      onToggle={() => setPricingExpanded(value => !value)}
                    />
                    {plan.name === "Enterprise" ? (
                      <Button color="dark" mt="auto" onClick={() => setEnterpriseDialogOpen(true)} variant="outline">
                        Request setup
                      </Button>
                    ) : (
                      <Button
                        color={plan.slug === "pro" ? "orange" : "dark"}
                        component={Link}
                        mt="auto"
                        to="/register/vendor"
                        variant={plan.slug === "pro" ? "filled" : "outline"}
                      >
                        {plan.slug === "free" ? "Start free" : "Choose plan"}
                      </Button>
                    )}
                  </Stack>
                </Paper>
              ))}
            </SimpleGrid>
          </Stack>
        </Container>
      </Box>

      <section id="get-started" className="lp-closing" aria-labelledby="closing-title">
        <div className="lp-container lp-closing-grid">
          <div className="lp-closing-copy">
            <p className="lp-eyebrow" data-closing-reveal>A BETTER DAY STARTS HERE</p>
            <h2 id="closing-title"><span data-closing-reveal>Good service.</span><br /><em data-closing-reveal>More breathing room.</em></h2>
            <p data-closing-reveal>Give your customers their time back.<br />Give your team a clearer way to serve.</p>
            <div className="lp-closing-actions">
              <Button data-closing-reveal component={Link} to="/register/vendor" color="orange" size="xl" radius="xl" rightSection={<IconArrowUpRight size={22} stroke={1.5} aria-hidden="true" />}>Create your workspace</Button>
              <a data-closing-reveal href="/vendors" className="lp-text-link">Explore vendors <IconArrowRight size={16} aria-hidden="true" /></a>
            </div>
            <div className="lp-closing-footnote" data-closing-reveal>From the first scan to the final smile.</div>
          </div>
          <div className="lp-closing-scene">
            <img className="lp-closing-logo" src="/logo.svg" alt="" aria-hidden="true" />
            <div className="lp-closing-scene-label"><span className="lp-dot" />LESS WAITING. MORE POSSIBILITY.</div>
            <img className="lp-closing-art" src="/illustrations/generated/cta-queue-scene-transparent.png" alt="Customers enjoying a calm service queue" loading="lazy" />
            <div className="lp-closing-scene-footer"><span>YOUR PLACE IS KEPT.</span><span>YOUR DAY IS YOURS. <IconArrowUpRight size={12} aria-hidden="true" /></span></div>
          </div>
        </div>
      </section>

      <Modal
        centered
        className="customer-modal"
        transitionProps={{ transition: "slide-up", duration: 240, timingFunction: "ease-out" }}
        classNames={{
          body: "enterprise-contact-modal-body",
          content: "enterprise-contact-modal",
          header: "enterprise-contact-modal-header",
          title: "enterprise-contact-modal-title"
        }}
        opened={enterpriseDialogOpen}
        onClose={() => setEnterpriseDialogOpen(false)}
        size={1180}
        title={
          <Stack className="getprio-modal-title" gap={2}>
            <Text className="getprio-modal-eyebrow">ENTERPRISE</Text>
            <Text className="getprio-modal-heading">Enterprise consultation</Text>
          </Stack>
        }
      >
        <Box component="form" className="enterprise-contact-modal-shell" onSubmit={handleEnterpriseSubmit}>
          <ScrollArea className="enterprise-contact-modal-main" offsetScrollbars scrollbars="y" scrollbarSize={8} type="always">
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
                  <PhilippineMobileInput
                    name="phone"
                    label="Phone"
                    size="lg"
                    value={enterpriseForm.phone}
                    onChange={(nextValue) =>
                      setEnterpriseForm((current) => ({ ...current, phone: nextValue }))
                    }
                  />
                </SimpleGrid>
                <Box className="enterprise-message-field">
                  <Textarea
                    autosize
                    classNames={{ input: "enterprise-message-input" }}
                    label="Message"
                    maxLength={enterpriseMessageMaxLength}
                    maxRows={10}
                    minRows={4}
                    name="message"
                    placeholder="Tell us about branches, expected queue volume, or support needs."
                    size="lg"
                    value={enterpriseForm.message}
                    onChange={(event) =>
                      setEnterpriseForm((current) => ({
                        ...current,
                        message: event.currentTarget.value.slice(0, enterpriseMessageMaxLength)
                      }))
                    }
                  />
                  <Text aria-live="polite" className="enterprise-message-counter" c="dimmed" size="xs">
                    {enterpriseForm.message.length}/{enterpriseMessageMaxLength} characters
                  </Text>
                </Box>
                <TextInput
                  aria-hidden="true"
                  autoComplete="off"
                  className="contact-form-honeypot"
                  name="honeypot"
                  onChange={(event) =>
                    setEnterpriseForm((current) => ({ ...current, honeypot: event.currentTarget.value }))
                  }
                  tabIndex={-1}
                  value={enterpriseForm.honeypot}
                />
                {shouldUseEnterpriseTurnstile ? (
                  <Box className="turnstile-panel">
                    <div ref={enterpriseTurnstileContainerRef} />
                  </Box>
                ) : null}
                {enterpriseError ? <Alert color="red">{enterpriseError}</Alert> : null}
              </Stack>
              </Box>
            </SimpleGrid>
          </ScrollArea>
          <Group className="customer-modal-actions enterprise-contact-modal-footer" justify="space-between">
            <Text c="dimmed" size="sm">
              Protected by anti-abuse verification and rate limiting. We only use this to respond to your request.
            </Text>
            <Button
              color="dark"
              disabled={enterpriseSubmitting || (shouldUseEnterpriseTurnstile && !enterpriseTurnstileReady)}
              size="md"
              type="submit"
            >
              {enterpriseSubmitting ? "Sending..." : "Send request"}
            </Button>
          </Group>
        </Box>
      </Modal>
    </Stack>
  );
}
