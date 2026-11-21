import { Button } from "@vendor/components/ui/button";
import { Alert, AlertDescription } from "@vendor/components/ui/alert";
import { Card, CardHeader, CardDescription, CardContent, CardFooter } from "@vendor/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@vendor/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@vendor/components/ui/field";
import { Input } from "@vendor/components/ui/input";
import { Textarea } from "@vendor/components/ui/textarea";
import { appUrl } from "../surfaces/surfaceConfig";
import { useEffect, useRef, useState, type FormEvent } from "react";
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
import { toast } from "@vendor/components/ui/toast";
import { Link, useLocation } from "react-router-dom";
import type { BillingOverviewResponse, EnterpriseInquiryRequest, EnterpriseInquiryResponse, SubscriptionPlan } from "@shared";
import { formatPhilippineMobileNumber, normalizePhilippineMobileNumber } from "../utils/phones";
import { apiRequest } from "../api/client";
import { getErrorMessage } from "../utils/errors";
import { getPlanPriceDisplay } from "../utils/subscriptionPlans";
import PricingHighlights from "./PricingHighlights";

import WorkflowSpotlight from "../pages/WorkflowSpotlight";
import LandingRibbons from "../pages/LandingRibbons";
import HeroPhones from "../pages/HeroPhones";
import ConnectedScreensParallax from "../pages/ConnectedScreensParallax";
import { useLandingMotion } from "../pages/useLandingMotion";
import { usePricingMagnet } from "../pages/usePricingMagnet";
import "./LandingMotion.css";

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
  free: "/illustrations/generated/vendor-onboarding.png",
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
      toast.add({
        type: "success",
        description: "We sent your request to the GetPrio platform team.",
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

  return <div ref={landingRoot} className="lp-page"><LandingRibbons />
      <section className="lp-hero" id="product">
        <div className="lp-container lp-hero-grid">
          <div className="lp-hero-content">
            <h1 className="lp-title">
              <span className="lp-hero-line"><span>Your day.</span></span>
              <span className="lp-hero-line"><span>Your pace.</span></span>
              <span className="lp-hero-line"><span><em>Your priority.</em></span></span>
            </h1>
            <p className="lp-hero-copy">Life happens beyond the line. Join a queue, follow your place, and get a heads-up when it’s your turn.</p>
            <div className="lp-hero-actions">
              <Button size="lg" render={<a href={appUrl("customer", "/vendors")} />}>Find your next stop <IconArrowUpRight size={22} stroke={1.5} aria-hidden="true" /></Button>
              <a className="lp-text-link" href="#workflow">See how it works <IconArrowDown size={14} aria-hidden="true" /></a>
            </div>
            <div className="lp-app-links">
              <Button disabled={!iOSAppStoreUrl} variant="ghost" render={<a href={iOSAppStoreUrl || undefined} target="_blank" rel="noreferrer" />}><IconBrandApple data-icon="inline-start" aria-hidden="true" />{iOSAppStoreUrl ? 'Get the iOS app' : 'iOS download coming soon'}</Button>
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
          <h2 id="lp-manifesto-title">{'A coffee. A conversation. A moment to yourself.'.split(' ').map((word, i) => <span className="lp-manifesto-word" key={i}>{word} </span>)}<em>{'There’s more to your day than waiting.'.split(' ').map((word, i) => <span className="lp-manifesto-word" key={i}>{word} </span>)}</em></h2>
          <div className="lp-manifesto-bottom"><IconAsterisk className="lp-asterisk" size={65} stroke={1} aria-hidden="true" /><p data-reveal>We give people a clearer wait.<br />And service teams a calmer way to work.</p></div>
        </div>
      </section>

      <section className="lp-features" id="solutions">
        <div className="lp-container">
          <div className="lp-section-rule" />
          <header className="lp-section-head" data-reveal><h2>One rhythm.<br /><em>Every screen.</em></h2><p>From the phone in your hand to the team behind the counter. Everyone sees what’s next.</p></header>
          <div className="lp-feature-stage">
            <span className="lp-stage-label">THE WHOLE QUEUE, IN SYNC</span>
            <ConnectedScreensParallax />
            <div className="lp-stage-foot"><span>THE PUBLIC BOARD</span><span>YOUR PHONE</span><span>YOUR TEAM</span></div>
          </div>
          <div className="lp-feature-list">{services.map(service => {
            const Icon = service.icon;
            return <article className="lp-feature" key={service.title}><div className="lp-feature-heading"><Icon size={26} stroke={1.5} /><h3>{service.title}</h3></div><p>{service.text}</p></article>;
          })}</div>
        </div>
      </section>

      <WorkflowSpotlight />

      <section className="lp-pricing" id="pricing"><div className="marketing-container"><header className="prio-centered-copy" data-reveal><h2>A calmer day. At every scale.</h2></header>
        {pricingError && <Alert variant="error"><AlertDescription>{pricingError}</AlertDescription></Alert>}
        <div className="marketing-pricing-grid">{pricingPlans.map(plan => <Card className={plan.slug === "pro" ? "prio-pricing-card prio-pricing-card-featured" : "prio-pricing-card"} key={plan.slug}>
          <CardHeader><img className="prio-plan-art" src={planArt[plan.slug]} alt="" /><h3 className="marketing-pricing-plan-name">{plan.name}</h3></CardHeader>
          <CardContent><div className="prio-price" aria-label={getPlanPriceDisplay(plan)}><span>{plan.slug === "enterprise" ? "Starts at " : ""}{plan.price.currency}</span><div className="prio-price-line"><strong className="prio-price-amount">{monthlyPriceFormatter.format(plan.price.monthlyAmountCents / 100)}</strong><span>/mo</span></div></div><CardDescription className="marketing-pricing-subtitle">{plan.bestFor}</CardDescription><PricingHighlights plan={plan} expanded={pricingExpanded} onToggle={() => setPricingExpanded(value => !value)} /></CardContent>
          <CardFooter>{plan.name === "Enterprise" ? <Button variant="outline" onClick={() => setEnterpriseDialogOpen(true)}>Request setup</Button> : <Button variant={plan.slug === "pro" ? "default" : "outline"} render={<a href={appUrl("vendor", "/register")} />}>{plan.slug === "free" ? "Start free" : "Choose plan"}</Button>}</CardFooter>
        </Card>)}</div></div></section>
      <section id="get-started" className="lp-closing" aria-labelledby="closing-title">
        <div className="lp-container lp-closing-grid">
          <div className="lp-closing-copy">
            <h2 id="closing-title"><span data-closing-reveal>Good service.</span><br /><em data-closing-reveal>More breathing room.</em></h2>
            <p data-closing-reveal>Give your customers their time back.<br />Give your team a clearer way to serve.</p>
            <div className="lp-closing-actions" data-closing-reveal>
              <Button size="lg" render={<a href={appUrl("vendor", "/register")} />}>Create your workspace<IconArrowUpRight data-icon="inline-end" aria-hidden="true" /></Button>
              <a href={appUrl("customer", "/vendors")} className="lp-text-link">Explore vendors <IconArrowRight size={16} aria-hidden="true" /></a>
            </div>
            <div className="lp-closing-footnote" data-closing-reveal>From the first scan to the final smile.</div>
          </div>
          <div className="lp-closing-scene">
            <img className="lp-closing-logo" src="/logo.svg" alt="" aria-hidden="true" />
            <div className="lp-closing-scene-label"><span className="lp-dot" />LESS WAITING. MORE POSSIBILITY.</div>
            <img className="lp-closing-art" src="/illustrations/generated/cta-queue-scene-transparent.png" alt="Customers enjoying a calm service queue" loading="lazy" />
          </div>
        </div>
      </section>

      <Dialog open={enterpriseDialogOpen} onOpenChange={setEnterpriseDialogOpen}><DialogContent className="marketing-enterprise-dialog"><DialogHeader><DialogTitle>Enterprise consultation</DialogTitle><DialogDescription>Tell us about your locations, expected queue volume, and support needs. We will route your request to the GetPrio platform team.</DialogDescription></DialogHeader>
        <form onSubmit={handleEnterpriseSubmit}><FieldGroup><div className="marketing-enterprise-fields">
          {([['businessName', 'Business name'], ['contactName', 'Contact name'], ['email', 'Email']] as const).map(([name,label]) => <Field key={name}><FieldLabel htmlFor={`enterprise-${name}`}>{label}</FieldLabel><Input id={`enterprise-${name}`} name={name} required type={name === 'email' ? 'email' : 'text'} value={enterpriseForm[name]} onChange={event => { const value = event.currentTarget.value; setEnterpriseForm(current => ({ ...current, [name]: value })); }} /></Field>)}
          <Field><FieldLabel htmlFor="enterprise-phone">Phone</FieldLabel><Input id="enterprise-phone" name="phone" inputMode="numeric" placeholder="(0917) 123-4567" value={formatPhilippineMobileNumber(enterpriseForm.phone)} onChange={event => { const value = normalizePhilippineMobileNumber(event.currentTarget.value); setEnterpriseForm(current => ({ ...current, phone: value })); }} /></Field>
          <Field className="full-width"><FieldLabel htmlFor="enterprise-message">Message</FieldLabel><Textarea id="enterprise-message" name="message" rows={4} maxLength={enterpriseMessageMaxLength} placeholder="Tell us about branches, expected queue volume, or support needs." value={enterpriseForm.message} onChange={event => { const value = event.currentTarget.value.slice(0, enterpriseMessageMaxLength); setEnterpriseForm(current => ({ ...current, message: value })); }} /><p className="enterprise-message-counter" aria-live="polite">{enterpriseForm.message.length}/{enterpriseMessageMaxLength}</p></Field>
        </div><Input className="contact-form-honeypot" name="honeypot" tabIndex={-1} aria-hidden="true" autoComplete="off" value={enterpriseForm.honeypot} onChange={event => { const value = event.currentTarget.value; setEnterpriseForm(current => ({...current, honeypot: value})); }} />
        {shouldUseEnterpriseTurnstile && <div className="turnstile-panel" ref={enterpriseTurnstileContainerRef} />}
        {enterpriseError && <Alert variant="error"><AlertDescription>{enterpriseError}</AlertDescription></Alert>}
        <p>Protected by anti-abuse verification and rate limiting. We only use this to respond to your request.</p>
        <Button type="submit" disabled={enterpriseSubmitting || (shouldUseEnterpriseTurnstile && !enterpriseTurnstileReady)}>{enterpriseSubmitting ? "Sending..." : "Send request"}</Button>
        </FieldGroup></form></DialogContent></Dialog>
    </div>;
}
