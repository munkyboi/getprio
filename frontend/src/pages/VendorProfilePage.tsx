import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title
} from "@mantine/core";
import { IconArrowLeft, IconCalendar, IconMapPin, IconTicket, IconUserPlus } from "@tabler/icons-react";
import { Link, useParams } from "react-router-dom";
import type { PublicVendorProfile, PublicVendorProfileResponse } from "@shared";
import { apiRequest } from "../api/client";
import { getErrorMessage } from "../utils/errors";

function getLocationLabel(vendor: PublicVendorProfile) {
  const parts = [
    vendor.location.name,
    vendor.location.city,
    vendor.location.province
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : vendor.location.country || "Philippines";
}

export default function VendorProfilePage() {
  const { tenantSlug = "" } = useParams<{ tenantSlug: string }>();
  const [vendor, setVendor] = useState<PublicVendorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!tenantSlug) {
      setError("Vendor not found.");
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError("");

    apiRequest<PublicVendorProfileResponse>(`/public/vendors/${tenantSlug}`)
      .then((data) => {
        if (!active) {
          return;
        }
        setVendor(data.vendor);
      })
      .catch((loadError) => {
        if (active) {
          setError(getErrorMessage(loadError));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [tenantSlug]);

  const locationLabel = useMemo(() => (vendor ? getLocationLabel(vendor) : ""), [vendor]);

  return (
    <Stack className="vendor-profile-page" gap="xl">
      <Container size="xl" w="100%">
        <Button
          color="dark"
          component={Link}
          leftSection={<IconArrowLeft size={18} />}
          mb="xl"
          to="/vendors"
          variant="subtle"
        >
          Back to vendors
        </Button>

        {loading ? (
          <Paper className="vendor-empty-panel" p="xl">
            <Text c="dimmed" fw={700}>Loading vendor profile...</Text>
          </Paper>
        ) : null}

        {error ? <Alert color="red">{error}</Alert> : null}

        {vendor ? (
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="xl">
            <Stack gap="xl">
              <div>
                <Text className="prio-label">Vendor profile</Text>
                <Group gap="sm" mt="xs">
                  {vendor.category ? <Badge color="orange" size="lg" variant="light">{vendor.category}</Badge> : null}
                  <Badge color="teal" size="lg" variant="light">Public profile</Badge>
                </Group>
                <Title className="prio-section-title" order={1} mt="md">
                  {vendor.name}
                </Title>
                <Group c="dimmed" gap={8} mt="md" wrap="nowrap">
                  <IconMapPin size={18} />
                  <Text>{locationLabel}</Text>
                </Group>
              </div>

              <Text className="prio-lead">
                {vendor.description || "This vendor is preparing detailed service information. You can still continue to the public queue when same-day service is available."}
              </Text>

              <Group>
                <Button color="orange" component={Link} leftSection={<IconTicket size={18} />} size="lg" to={`/join/${vendor.slug}`}>
                  Join same-day queue
                </Button>
                <Button color="dark" component={Link} size="lg" to="/register/customer" variant="outline">
                  Create customer account
                </Button>
              </Group>
            </Stack>

            <Paper className="vendor-profile-panel" p="xl">
              <Stack gap="lg">
                <div className="vendor-profile-image">
                  {vendor.imageUrl ? <img alt="" src={vendor.imageUrl} /> : <IconTicket size={54} />}
                </div>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <Paper className="vendor-profile-action" p="lg">
                    <ThemeIcon color="orange" radius="xl" size={46} variant="light">
                      <IconTicket size={23} />
                    </ThemeIcon>
                    <Title order={4} mt="md">Same-day queue</Title>
                    <Text c="dimmed" size="sm" mt={6}>
                      Continue into the existing GetPrio queue flow for this vendor.
                    </Text>
                  </Paper>
                  <Paper className="vendor-profile-action" p="lg">
                    <ThemeIcon color="teal" radius="xl" size={46} variant="light">
                      <IconCalendar size={23} />
                    </ThemeIcon>
                    <Title order={4} mt="md">Bookings soon</Title>
                    <Text c="dimmed" size="sm" mt={6}>
                      Service catalog and booking request screens are the next capstone slice.
                    </Text>
                  </Paper>
                </SimpleGrid>
                <Paper className="vendor-profile-action" p="lg">
                  <Group gap="md" wrap="nowrap">
                    <ThemeIcon color="dark" radius="xl" size={46} variant="light">
                      <IconUserPlus size={23} />
                    </ThemeIcon>
                    <div>
                      <Text fw={900}>Customer profile reuse</Text>
                      <Text c="dimmed" size="sm">
                        Signed-in customers can reuse their contact details when joining queues and future booking flows.
                      </Text>
                    </div>
                  </Group>
                </Paper>
              </Stack>
            </Paper>
          </SimpleGrid>
        ) : null}
      </Container>
    </Stack>
  );
}
