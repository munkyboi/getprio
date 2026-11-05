import { Button, Card, Divider, Stack, Text } from "@mantine/core";
import {
  IconLayoutDashboard,
  IconCalendarEvent,
  IconListDetails,
  IconLock,
  IconSettings
} from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { type ReactNode } from "react";

export type CustomerAccountSection =
  | "dashboard"
  | "tickets"
  | "bookings"
  | "settings"
  | "notifications"
  | "security";

const ACCOUNT_SECTIONS: Array<{
  key: CustomerAccountSection;
  label: string;
  path: string;
  icon: typeof IconLayoutDashboard;
  children?: Array<{
    label: string;
    path: string;
  }>;
}> = [
  { key: "dashboard", label: "Dashboard", path: "/account/dashboard", icon: IconLayoutDashboard },
  { key: "tickets", label: "Queue Tickets", path: "/account/tickets", icon: IconListDetails },
  { key: "bookings", label: "Bookings", path: "/account/bookings", icon: IconCalendarEvent },
  { key: "settings", label: "Settings", path: "/account/settings", icon: IconSettings },
  { key: "notifications", label: "Notifications", path: "/account/notifications", icon: IconSettings },
  { key: "security", label: "Security", path: "/account/security", icon: IconLock }
];

export default function CustomerAccountLayout({
  activeSection,
  children
}: {
  activeSection: CustomerAccountSection;
  children: ReactNode;
}) {
  return (
    <Stack
      className="customer-account-page"
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
          {children}
        </div>
      </div>
    </Stack>
  );
}
