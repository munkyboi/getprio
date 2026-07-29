import { Button, Card, Collapse, Divider, Stack, Text } from "@mantine/core";
import {
  IconChevronDown,
  IconLayoutDashboard,
  IconCalendarEvent,
  IconListDetails,
  IconLock,
  IconSettings,
  IconSpeakerphone
} from "@tabler/icons-react";
import { Link, useLocation } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";

export type CustomerAccountSection =
  | "dashboard"
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
  icon: typeof IconLayoutDashboard;
  children?: Array<{
    label: string;
    path: string;
  }>;
}> = [
  { key: "dashboard", label: "Dashboard", path: "/account/dashboard", icon: IconLayoutDashboard },
  { key: "tickets", label: "Queue Tickets", path: "/account/tickets", icon: IconListDetails },
  { key: "bookings", label: "Bookings", path: "/account/bookings", icon: IconCalendarEvent },
  {
    key: "campaigns",
    label: "Campaigns",
    path: "/account/campaigns",
    icon: IconSpeakerphone,
    children: [
      { label: "Your campaigns", path: "/account/campaigns" },
      { label: "Discover campaigns", path: "/account/campaigns/discover" }
    ]
  },
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
  const location = useLocation();
  const [campaignsExpanded, setCampaignsExpanded] = useState(activeSection === "campaigns");

  useEffect(() => {
    if (activeSection === "campaigns") {
      setCampaignsExpanded(true);
    }
  }, [activeSection]);

  function isSubmenuActive(path: string) {
    if (path === "/account/campaigns") {
      return location.pathname === path ||
        (location.pathname.startsWith(`${path}/`) && location.pathname !== "/account/campaigns/discover");
    }

    return location.pathname === path;
  }

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

              if (section.children) {
                return (
                  <div className="customer-account-nav-group" key={section.key}>
                    <Button
                      aria-controls={`${section.key}-submenu`}
                      aria-expanded={campaignsExpanded}
                      color={isActive ? "orange" : "dark"}
                      justify="flex-start"
                      leftSection={<Icon size={18} />}
                      onClick={() => setCampaignsExpanded((expanded) => !expanded)}
                      rightSection={
                        <IconChevronDown
                          className={`customer-account-nav-chevron${campaignsExpanded ? " customer-account-nav-chevron--expanded" : ""}`}
                          size={16}
                        />
                      }
                      variant={isActive ? "light" : "subtle"}
                    >
                      {section.label}
                    </Button>
                    <Collapse in={campaignsExpanded}>
                      <Stack className="customer-account-subnav" gap={2} id={`${section.key}-submenu`}>
                        {section.children.map((child) => {
                          const isChildActive = isSubmenuActive(child.path);

                          return (
                            <Button
                              color={isChildActive ? "orange" : "dark"}
                              component={Link}
                              justify="flex-start"
                              key={child.path}
                              to={child.path}
                              variant={isChildActive ? "light" : "subtle"}
                            >
                              {child.label}
                            </Button>
                          );
                        })}
                      </Stack>
                    </Collapse>
                  </div>
                );
              }

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
