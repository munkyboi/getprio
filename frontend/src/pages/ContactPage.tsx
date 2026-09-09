import { Anchor, Button, Container, Text, Title } from "@mantine/core";
import { IconArrowUpRight, IconMail, IconBuildingStore, IconArrowRight } from "@tabler/icons-react";
import { Link } from "react-router-dom";

const supportEmail = String(import.meta.env.VITE_GETPRIO_SUPPORT_EMAIL || "").trim() || "support@getprio.online";

export default function ContactPage() {
  return (
    <section className="support-page">
      <Container size="lg" className="support-page-container">
        <header className="support-page-header">
          <Text className="support-eyebrow">GETPRIO SUPPORT</Text>
          <Title order={1}>How can we help?</Title>
          <Text className="support-page-intro">
            Questions about your account or something not working as expected? Let’s get you to the right place.
          </Text>
        </header>

        <div className="support-page-grid">
          <section className="support-primary-card" aria-labelledby="support-team-title">
            <div className="support-card-icon"><IconMail size={28} stroke={1.6} aria-hidden="true" /></div>
            <Text className="support-eyebrow">TALK TO OUR TEAM</Text>
            <Title order={2} id="support-team-title">We’re here to help.</Title>
            <Text className="support-card-copy">
              Contact GetPrio for account access, technical issues, payments, or a concern that needs our team’s attention.
            </Text>
            <div className="support-contact-action">
                <Button component="a" href={`mailto:${supportEmail}`} size="lg" radius="xl" color="dark" rightSection={<IconArrowUpRight size={19} aria-hidden="true" />}>
                  Email support
                </Button>
                <Anchor href={`mailto:${supportEmail}`}>{supportEmail}</Anchor>
                <Text size="sm" className="support-muted">Opens your email app. You can attach screenshots there.</Text>
            </div>
            <div className="support-message-guide">
              <Title order={3}>Help us understand what happened</Title>
              <ul>
                <li>The email address you use for GetPrio</li>
                <li>Your booking reference or queue ticket, if relevant</li>
                <li>A short description and a screenshot of the issue</li>
              </ul>
              <Text size="sm" className="support-muted">Never include your password, verification codes, or full payment card details.</Text>
            </div>
          </section>

          <aside className="support-side-column" aria-label="Other ways to find help">
            <section className="support-vendor-card" aria-labelledby="support-vendor-title">
              <IconBuildingStore size={28} stroke={1.6} aria-hidden="true" />
              <Title order={2} id="support-vendor-title">A question for a business?</Title>
              <Text>For service details, availability, or changes to a booking, start with the business you booked with.</Text>
              <Button component={Link} to="/vendors" variant="outline" color="dark" radius="xl" size="md" rightSection={<IconArrowRight size={18} aria-hidden="true" />}>Find your vendor</Button>
              <Text size="sm">Open their profile to find their contact details.</Text>
            </section>
            <section className="support-expectations" aria-labelledby="support-before-title">
              <Title order={3} id="support-before-title">Before you reach out</Title>
              <details>
                <summary>I can’t sign in</summary>
                <Text>Use the password reset option on the sign-in page. If you still need help, email our team with the address associated with your account.</Text>
              </details>
              <details>
                <summary>I have a payment or refund concern</summary>
                <Text>Include the business name, booking reference, and payment date. Explain what you’ve already discussed with the business so our team has the context.</Text>
              </details>
              <details>
                <summary>I want to report a problem</summary>
                <Text>Tell us what you were trying to do and what happened instead. Include the page or app screen and any error message you saw.</Text>
              </details>
            </section>
          </aside>
        </div>
      </Container>
    </section>
  );
}
