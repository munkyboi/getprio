import { useQuery } from "@tanstack/react-query";
import { Badge, Button, Card, Divider, Group, Stack, Text, Title } from "@mantine/core";
import {
  IconLayoutDashboard,
  IconCalendarEvent,
  IconId,
  IconListDetails,
  IconLock,
  IconSettings,
  IconSpeakerphone
} from "@tabler/icons-react";
import { Link } from "react-router-dom";
import type { CustomerAccountOverviewResponse } from "@shared";
import type { ReactNode } from "react";
import { customerAccountApi } from "../api/customerAccount";
import { useAuth } from "../context/AuthContext";

export type CustomerAccountSection =
  | "dashboard"
  | "profile"
  | "tickets"
  | "bookings"
  | "campaigns"
  | "group-funded"
  | "settings"
  | "notifications"
  | "security";

const ACCOUNT_SECTIONS: Array<{
  key: CustomerAccountSection;
  label: string;
  path: string;
  icon: typeof IconId;
}> = [
  { key: "dashboard", label: "Dashboard", path: "/account/dashboard", icon: IconLayoutDashboard },
  { key: "profile", label: "Profile details", path: "/account/profile", icon: IconId },
  { key: "tickets", label: "Queue Tickets", path: "/account/tickets", icon: IconListDetails },
  { key: "bookings", label: "Bookings", path: "/account/bookings", icon: IconCalendarEvent },
  { key: "campaigns", label: "Campaigns", path: "/account/campaigns", icon: IconSpeakerphone },
  { key: "settings", label: "Settings", path: "/account/settings", icon: IconSettings },
  { key: "notifications", label: "Notifications", path: "/account/notifications", icon: IconSettings },
  { key: "security", label: "Security", path: "/account/security", icon: IconLock }
];

export default function CustomerAccountLayout({
  accountUser,
  activeSection,
  children
}: {
  accountUser?: CustomerAccountOverviewResponse["user"] | null;
  activeSection: CustomerAccountSection;
  children: ReactNode;
}) {
  const { token, user } = useAuth();
  const accountQuery = useQuery({
    queryKey: ["customer-account", token],
    queryFn: async () => {
      if (!token) throw new Error("Missing authentication token.");
      return customerAccountApi.getOverview(token);
    },
    enabled: Boolean(token && activeSection === "profile" && !accountUser)
  });
  const resolvedUser = accountUser ?? accountQuery.data?.overview.user;

  return (
    <Stack
      className={`customer-account-page${activeSection === "dashboard" ? " customer-account-page--dashboard" : ""}`}
      gap="lg"
    >
      <div className="customer-account-layout">
        <Card className="customer-account-sidebar" p="md">
          <Stack gap={4}>
            {ACCOUNT_SECTIONS.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.key;

              return (
                <Button
                  color={isActive ? "orange" : "dark"}
                  component={Link}
                  justify="flex-start"
                  key={section.key}
                  leftSection={<Icon size={18} />}
                  to={section.path}
                  variant={isActive ? "light" : "subtle"}
                >
                  {section.label}
                </Button>
              );
            })}
          </Stack>
          <Divider my="md" />
          <Text c="dimmed" size="sm">
            Queue Tickets and Bookings are separated because a booking is scheduled intent, while a queue ticket is live service-day execution.
          </Text>
        </Card>
        <div className="customer-account-content">
          {activeSection === "profile" ? (
            <Card className="finazze-auth-card customer-account-card customer-account-hero" p="xl">
              <Group align="flex-start" justify="space-between" gap="lg">
                <Stack gap={4}>
                  <Text className="finazze-section-label">Customer account</Text>
                  <Title order={1}>{resolvedUser?.name || user?.name || "Customer"}</Title>
                  <Text c="dimmed">
                    {resolvedUser?.username ? `@${resolvedUser.username}` : "Username not set"}
                  </Text>
                </Stack>
                <Group gap="xs">
                  <Badge color={resolvedUser?.emailVerified ? "teal" : "yellow"} variant="light">
                    {resolvedUser?.emailVerified ? "Email verified" : "Email not verified"}
                  </Badge>
                  <Badge color={resolvedUser?.mfaEnabled ? "teal" : "gray"} variant="light">
                    {resolvedUser?.mfaEnabled ? "MFA enabled" : "MFA off"}
                  </Badge>
                </Group>
              </Group>
            </Card>
          ) : null}
          {children}
        </div>
      </div>
    </Stack>
  );
}
