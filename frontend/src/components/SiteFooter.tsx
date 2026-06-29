import { Anchor, Box, Container, Grid, Group, Stack, Text } from "@mantine/core";
import {
  IconChevronRight,
  IconBrandFacebook,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandX,
  IconBrandYoutube
} from "@tabler/icons-react";
import { Link } from "react-router-dom";

const footerGroups = [
  {
    title: "Platform",
    links: [
      { label: "Browse Services", to: "/vendors" },
      { label: "How It Works", to: "/#solutions" },
      { label: "For Customers", to: "/register/customer" },
      { label: "For Providers", to: "/register/vendor" },
      { label: "Pricing", to: "/#pricing" },
      { label: "Become a Provider", to: "/register/vendor" }
    ]
  },
  {
    title: "Support",
    links: [
      { label: "Help Center", to: "/login" },
      { label: "Safety Center", to: "/login" },
      { label: "Booking Guide", to: "/vendors" },
      { label: "Payment & Refunds", to: "/login" },
      { label: "Contact Us", to: "/register/vendor" },
      { label: "Report an Issue", to: "/login" }
    ]
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", to: "/privacy-policy" },
      { label: "Terms of Service", to: "/terms" },
      { label: "Cookie Policy", to: "/privacy-policy#cookies" },
      { label: "Acceptable Use Policy", to: "/terms#acceptable-use" },
      { label: "Data Processing Addendum", to: "/privacy-policy#data-processing" }
    ]
  }
] as const;

const socialLinks = [
  { label: "Facebook", Icon: IconBrandFacebook },
  { label: "X", Icon: IconBrandX },
  { label: "Instagram", Icon: IconBrandInstagram },
  { label: "LinkedIn", Icon: IconBrandLinkedin },
  { label: "YouTube", Icon: IconBrandYoutube }
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
                {socialLinks.map(({ label, Icon }) => (
                  <Box aria-label={label} className="site-footer-social" component="span" key={label}>
                    <Icon size={18} stroke={2} />
                  </Box>
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
