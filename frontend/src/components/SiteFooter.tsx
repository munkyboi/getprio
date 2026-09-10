import { Anchor, Box, Container, Grid, Group, Stack, Text } from "@mantine/core";
import { IconChevronRight, IconBrandFacebook, IconBrandInstagram, IconBrandLinkedin, IconBrandX, IconBrandYoutube } from "@tabler/icons-react";
import { Link } from "react-router-dom";

const footerGroups = [
  {
    title: "Platform",
    links: [
      { label: "Browse Services", to: "/vendors" },
      { label: "How It Works", to: "/#workflow" },
      { label: "For Customers", to: "/register/customer" },
      { label: "For Providers", to: "/register/vendor" },
      { label: "Pricing", to: "/#pricing" },
      { label: "Become a Provider", to: "/register/vendor" }
    ]
  },
  {
    title: "Support",
    links: [
      { label: "Help Center", to: "/help" },
      { label: "FAQs", to: "/help#faq" },
      { label: "Booking Guide", to: "/help?topic=bookings" },
      { label: "Payments & Refunds", to: "/help?topic=payments" },
      { label: "Contact Us", to: "/contact" },
      { label: "Report an Issue", to: "/contact" }
    ]
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", to: "/privacy-policy" },
      { label: "Terms of Service", to: "/terms" },
      { label: "Cookies & Storage", to: "/privacy-policy#cookies" },
      { label: "Acceptable Use", to: "/terms#user-conduct" },
    ]
  }
] as const;

const socialLinks = [
  { label: "Facebook", Icon: IconBrandFacebook, href: "https://www.facebook.com/people/GetPrio/61591068855439/" },
  { label: "X", Icon: IconBrandX, href: "#" },
  { label: "Instagram", Icon: IconBrandInstagram, href: "https://www.instagram.com/getprio.online/" },
  { label: "LinkedIn", Icon: IconBrandLinkedin, href: "#" },
  { label: "YouTube", Icon: IconBrandYoutube, href: "#" }
] as const;

export default function SiteFooter() {
  return (
    <Box component="footer" className="site-footer">
      <Container size="xl">
        <Grid gutter={{ base: "xl", md: 56 }}>
          <Grid.Col span={{ base: 12, md: 3 }}>
            <Stack gap="md" className="site-footer-brand">
              <Group gap="sm" wrap="nowrap" align="center" className="site-footer-brandmark">
                <img className="site-footer-logo" src="/logo-dark.svg" alt="GetPrio" />
                <Text fw={900} c="white" lh={1}>
                  GetPrio
                </Text>
              </Group>
              <Text c="rgba(255,255,255,0.72)" lh={1.75}>
                GetPrio connects you with trusted professionals for every task.
                Book with confidence, pay securely, and get things done.
              </Text>
              <Group gap="sm" className="site-footer-socials">
                {socialLinks.map(({ label, Icon, href }) => (
                  <Anchor
                    key={label}
                    aria-label={label}
                    className="site-footer-social"
                    href={href}
                    target={href === "#" ? undefined : "_blank"}
                    rel={href === "#" ? undefined : "noopener noreferrer"}
                  >
                    <Icon size={18} stroke={2} aria-hidden="true" />
                  </Anchor>
                ))}
              </Group>
            </Stack>
          </Grid.Col>
          {footerGroups.map((group) => (
            <Grid.Col key={group.title} span={{ base: 12, sm: 6, md: 3 }}>
              <Stack gap="md">
                <Text className="site-footer-title">{group.title}</Text>
                <Stack gap="sm">
                  {group.links.map((link) => (
                    <Anchor
                      className="site-footer-link"
                      component={Link}
                      key={link.label}
                      to={link.to}
                      reloadDocument={link.to.includes("#")}
                    >
                      <Group justify="space-between" wrap="nowrap" gap="sm">
                        <span>{link.label}</span>
                        <IconChevronRight className="site-footer-arrow" size={14} stroke={2} />
                      </Group>
                    </Anchor>
                  ))}
                </Stack>
              </Stack>
            </Grid.Col>
          ))}
        </Grid>
        <Group className="site-footer-bottom" justify="space-between" wrap="wrap">
          <Text c="rgba(255,255,255,0.7)">© 2026 GetPrio</Text>
          <Group gap="xl">
            <Anchor className="site-footer-bottom-link" component={Link} to="/privacy-policy">
              Privacy Policy
            </Anchor>
            <Anchor className="site-footer-bottom-link" component={Link} to="/terms">
              Terms of Service
            </Anchor>
          </Group>
        </Group>
      </Container>
    </Box>
  );
}
