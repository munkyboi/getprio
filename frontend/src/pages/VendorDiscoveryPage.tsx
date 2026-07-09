import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
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
  TextInput,
  Title
} from "@mantine/core";
import { IconMapPin, IconSearch, IconTicket } from "@tabler/icons-react";
import { Link, useSearchParams } from "react-router-dom";
import type { PublicVendorListResponse, PublicVendorProfile } from "@shared";
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

function getBranchLabel(location: PublicVendorProfile["locations"][number]) {
  const parts = [
    location.name,
    location.city,
    location.province
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : location.country || "Philippines";
}

function getVendorMediaStyle(vendor: PublicVendorProfile): CSSProperties | undefined {
  const backgroundImageUrl = vendor.publicBoardTheme?.theme.backgroundImageUrl;

  if (!backgroundImageUrl) {
    return undefined;
  }

  return {
    "--vendor-theme-card-bg": vendor.publicBoardTheme?.theme.cardBackgroundColor,
    backgroundImage: `linear-gradient(rgba(255,255,255,0.2), rgba(255,255,255,0.2)), url(${backgroundImageUrl})`
  } as CSSProperties;
}

export default function VendorDiscoveryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSearch = searchParams.get("search") || "";
  const [search, setSearch] = useState(initialSearch);
  const [vendors, setVendors] = useState<PublicVendorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const query = searchParams.get("search") || "";
    const path = query ? `/public/vendors?search=${encodeURIComponent(query)}` : "/public/vendors";

    setLoading(true);
    setError("");
    apiRequest<PublicVendorListResponse>(path, { signal: controller.signal })
      .then((data) => {
        setVendors(data.vendors);
      })
      .catch((loadError) => {
        if (controller.signal.aborted) {
          return;
        }
        setError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [searchParams]);

  const resultLabel = useMemo(() => {
    if (loading) {
      return "Searching vendors...";
    }

    return vendors.length === 1 ? "1 vendor found" : `${vendors.length} vendors found`;
  }, [loading, vendors.length]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSearch = search.trim();
    if (nextSearch) {
      setSearchParams({ search: nextSearch });
    } else {
      setSearchParams({});
    }
  }

  return (
    <Stack className="vendor-discovery-page" gap="xl">
      <Container size="xl" w="100%">
        <Stack gap="xl">
          <div>
            <Text className="prio-label">Vendor discovery</Text>
            <Title className="prio-section-title" order={1}>
              Find vendors ready for service.
            </Title>
            <Text className="prio-lead" mt="md">
              Browse public GetPrio vendors, check their service location, and continue into the
              same-day queue flow when you are ready.
            </Text>
          </div>

          <Paper className="vendor-search-panel" p="lg">
            <form onSubmit={handleSubmit}>
              <Group align="flex-end" gap="md">
                <TextInput
                  className="vendor-search-input"
                  leftSection={<IconSearch size={18} />}
                  label="Search vendors"
                  placeholder="Search by name, category, city, or province"
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                />
                <Button color="orange" leftSection={<IconSearch size={18} />} type="submit">
                  Search
                </Button>
                {searchParams.get("search") ? (
                  <Button
                    color="dark"
                    variant="subtle"
                    onClick={() => {
                      setSearch("");
                      setSearchParams({});
                    }}
                  >
                    Clear
                  </Button>
                ) : null}
              </Group>
            </form>
          </Paper>

          {error ? <Alert color="red">{error}</Alert> : null}

          <Group justify="space-between">
            <Text c="dimmed" fw={700}>{resultLabel}</Text>
          </Group>

          {!loading && !vendors.length ? (
            <Paper className="vendor-empty-panel" p="xl">
              <Stack align="center" gap="sm">
                <Title order={3}>No vendors found</Title>
                <Text c="dimmed" ta="center">
                  Try a different search term or check back when more vendors publish their public profiles.
                </Text>
              </Stack>
            </Paper>
          ) : null}

          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
            {vendors.map((vendor) => (
              <Paper className="vendor-card" component={Link} key={vendor.slug} p="lg" to={`/vendors/${vendor.slug}`}>
                <Stack gap="md" h="100%">
                  <div
                    className={vendor.publicBoardTheme?.theme.backgroundImageUrl || vendor.publicBoardTheme?.theme.logoUrl
                      ? "vendor-card-image vendor-card-image-themed"
                      : "vendor-card-image"}
                    style={getVendorMediaStyle(vendor)}
                  >
                    {vendor.publicBoardTheme?.theme.logoUrl ? (
                      <div className="vendor-card-logo-frame">
                        <img alt={`${vendor.name} logo`} src={vendor.publicBoardTheme.theme.logoUrl} />
                      </div>
                    ) : vendor.imageUrl ? (
                      <img alt="" src={vendor.imageUrl} />
                    ) : (
                      <IconTicket size={42} />
                    )}
                  </div>
                  <div>
                    {vendor.category ? <Badge color="orange" variant="light">{vendor.category}</Badge> : null}
                    <Title order={3} mt="sm">{vendor.name}</Title>
                    <Group c="dimmed" gap={6} mt={6} wrap="nowrap">
                      <IconMapPin size={16} />
                      <Text size="sm">{getLocationLabel(vendor)}</Text>
                    </Group>
                  </div>
                  <Text c="dimmed" lineClamp={3}>
                    {vendor.description || "This vendor is preparing a public service profile."}
                  </Text>
                  <Text c="dimmed" size="sm">
                    {vendor.locations.length === 1 ? "1 active location" : `${vendor.locations.length} active locations`}
                  </Text>
                  <div className="vendor-card-branches">
                    {vendor.locations.map((location) => (
                      <Badge
                        className="vendor-branch-chip"
                        color={location.isPrimary ? "orange" : "gray"}
                        key={location.slug}
                        variant="light"
                      >
                        {getBranchLabel(location)}
                      </Badge>
                    ))}
                  </div>
                  <Group mt="auto">
                    <Button
                      component={Link}
                      to={`/vendors/${vendor.slug}/book?location=${encodeURIComponent(vendor.location.slug || vendor.locations[0]?.slug || "")}`}
                      variant="light"
                      color="orange"
                    >
                      Book in advance
                    </Button>
                    <Button component={Link} to={`/join/${vendor.slug}`} variant="subtle" color="orange">
                      Join queue
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            ))}
          </SimpleGrid>
        </Stack>
      </Container>
    </Stack>
  );
}
