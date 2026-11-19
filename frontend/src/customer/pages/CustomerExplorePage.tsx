import { InputGroup, InputGroupAddon, InputGroupInput } from "../components/shadcn/input-group";
import { FieldLabel } from "../components/shadcn/field";
import { useQuery } from "@tanstack/react-query";
import type { VendorRatings } from "../components/vendor/useVendorDetails";
import { CustomerPage } from "../components/account/CustomerPage";
import { useCustomerTheme } from "../CustomerTheme";
import { RefreshCw, Star } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CircleAlert as IconAlertCircle,
  ChevronRight as IconChevronRight,
  MapPin as IconMapPin,
  Search as IconSearch,
} from "lucide-react";
import type { PublicVendorListResponse, PublicVendorProfile } from "@shared";
import { apiRequest } from "../../api/client";
import { getErrorMessage } from "../../utils/errors";
import { resolveVendorProfileMedia } from "../../utils/vendorTheme";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Separator,
  Skeleton,
} from "../components/ui";
function VendorCard({ vendor }: { vendor: PublicVendorProfile }) {
  const { theme } = useCustomerTheme();
  const ratings = useQuery({
    queryKey: ["customer-directory-rating", vendor.slug],
    queryFn: ({ signal }) =>
      apiRequest<VendorRatings>(
        `/public/vendors/${encodeURIComponent(vendor.slug)}/ratings?page=1&pageSize=1`,
        { signal },
      ),
    staleTime: 60000,
  });
  const media = resolveVendorProfileMedia(
    vendor.publicBoardTheme?.theme,
    vendor.businessProfileTheme?.theme,
  );
  const cover = media?.backgroundImageUrl || "";
  const logo = media?.logoUrl || vendor.imageUrl || "/logo.svg";
  const [failedCover, setFailedCover] = useState(false);
  const location = [
    vendor.location.name,
    vendor.location.city,
    vendor.location.province,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <Card className="customer-directory-card">
        <div className="customer-directory-cover">
          {cover && !failedCover ? (
            <img
              src={cover}
              alt=""
              loading="lazy"
              onError={() => setFailedCover(true)}
            />
          ) : (
            <img
              className="customer-default-cover"
              src={
                theme === "dark"
                  ? "/illustrations/customer/vendor-default-dark.png"
                  : "/illustrations/generated/hero-queue-scene-transparent.png"
              }
              alt=""
              loading="lazy"
            />
          )}
        </div>
        <CardHeader>
          <div className="customer-directory-identity">
            <Avatar>
              <AvatarImage
                src={logo}
                alt=""
                data-default-image={logo === "/logo.svg" || undefined}
              />
              <AvatarFallback>
                <img src="/logo.svg" alt="" />
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle>{vendor.name}</CardTitle>
              <CardDescription>{vendor.category}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="customer-directory-location">
            <IconMapPin aria-hidden="true" />
            {location || vendor.location.country}
          </p>
          <p>
            {vendor.locations.length}{" "}
            {vendor.locations.length === 1 ? "location" : "locations"}
          </p>
          <p className="customer-directory-rating">
            <Star aria-hidden="true" />
            {ratings.data?.rating
              ? ratings.data.rating.count > 0
                ? `${ratings.data.rating.average.toFixed(1)} · ${ratings.data.rating.count} reviews`
                : "No reviews yet"
              : ratings.isPending
                ? "Loading rating…"
                : "Rating unavailable"}
          </p>
        </CardContent>
        <CardFooter>
          <span>View vendor</span>
          <IconChevronRight aria-hidden="true" />
        </CardFooter>
      <Button nativeButton={false} variant="ghost" className="customer-directory-card-hit" aria-label={`View ${vendor.name}`} render={<Link to={`/vendors/${encodeURIComponent(vendor.slug)}`} />} />
    </Card>
  );
}
export default function CustomerExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("search") || "";
  const joinIntent = searchParams.get("intent") === "join";
  const [search, setSearch] = useState(query);
  const [vendors, setVendors] = useState<PublicVendorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [category, setCategory] = useState("All");
  useEffect(() => setSearch(query), [query]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setVendors([]);
    apiRequest<PublicVendorListResponse>(
      query
        ? `/public/vendors?search=${encodeURIComponent(query)}`
        : "/public/vendors",
      { signal: controller.signal },
    )
      .then((data) => {
        if (!Array.isArray(data.vendors))
          throw new Error(
            "The vendor list could not be read. Please try again.",
          );
        if (!controller.signal.aborted) setVendors(data.vendors);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(getErrorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, retry]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams(searchParams);
    if (search.trim()) params.set("search", search.trim());
    else params.delete("search");
    setSearchParams(params);
  }
  return (
    <CustomerPage
      title={joinIntent ? "Join a queue" : "Explore vendors"}
      subtitle={
        joinIntent
          ? "Choose a vendor, then select a location to join its queue."
          : "Find a business and plan your visit."
      }
    >
      <form className="customer-search-form" onSubmit={submit}>
        <FieldLabel className="customer-sr-only" htmlFor="customer-vendor-search">
          Search vendors
        </FieldLabel>
        <div className="customer-search-controls">
          <InputGroup className="customer-search-input">
            <InputGroupAddon><IconSearch aria-hidden="true" /></InputGroupAddon>
            <InputGroupInput
              id="customer-vendor-search"
              type="search"
              placeholder="Search vendors"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </InputGroup>
          <Button className="customer-sr-only" type="submit">
            Search
          </Button>
        </div>
      </form>
      <div className="customer-explore-filterbar">
        <div className="customer-action-row" aria-label="Vendor categories">
          {[
            "All",
            ...new Set(vendors.map((v) => v.category).filter(Boolean)),
          ].map((label) => (
            <Button
              key={label}
              variant="ghost"
              aria-pressed={category === label}
              onClick={() => setCategory(label)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <div className="customer-directory-status">
        <Badge variant="outline">Vendor directory</Badge>
        <Button
          variant="ghost"
          aria-label="Refresh vendors"
          onClick={() => setRetry((v) => v + 1)}
        >
          <RefreshCw />
          Refresh vendors
        </Button>
      </div>
      {error ? (
        <Alert>
          <IconAlertCircle aria-hidden="true" />
          <div>
            <AlertTitle>We couldn’t load vendors</AlertTitle>
            <AlertDescription>
              <p>{error}</p>
              <Button
                variant="outline"
                onClick={() => setRetry((value) => value + 1)}
              >
                Try again
              </Button>
            </AlertDescription>
          </div>
        </Alert>
      ) : null}
      <p className="customer-directory-count customer-sr-only" role="status">
        {loading
          ? "Loading vendors…"
          : error
            ? "Vendors are temporarily unavailable."
            : `${vendors.length} ${vendors.length === 1 ? "vendor" : "vendors"} found`}
      </p>
      {loading ? (
        <div className="customer-directory-grid" aria-label="Loading vendors">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="customer-directory-skeleton" />
          ))}
        </div>
      ) : error ? null : vendors.length ? (
        <div className="customer-directory-grid">
          {vendors
            .filter(
              (vendor) => category === "All" || vendor.category === category,
            )
            .map((vendor) => (
              <VendorCard vendor={vendor} key={vendor.slug} />
            ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No vendors found</CardTitle>
            <CardDescription>
              Try another name or location, or check back later.
            </CardDescription>
          </CardHeader>
          {query ? (
            <CardFooter>
              <Button
                variant="outline"
                onClick={() => {
                  const params = new URLSearchParams(searchParams);
                  params.delete("search");
                  setSearchParams(params);
                }}
              >
                Clear search
              </Button>
            </CardFooter>
          ) : null}
        </Card>
      )}
    </CustomerPage>
  );
}
