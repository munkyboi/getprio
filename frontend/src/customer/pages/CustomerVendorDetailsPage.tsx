import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "../components/shadcn/carousel";
import { Alert } from "../components/shadcn/alert";
import { useCustomerTheme } from "../CustomerTheme";
import { useEffect, useRef, useState } from "react";
import { VendorReviews } from "../components/vendor/VendorReviews";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import {
  Info,
  Check,
  Plus,
  ArrowLeft as IconArrowLeft,
  Clock as IconClock,
  Heart as IconHeart,
  Mail as IconMail,
  MapPin as IconMapPin,
  Phone as IconPhone,
  Star as IconStar,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { resolveVendorProfileMedia } from "../../utils/vendorTheme";
import { getErrorMessage } from "../../utils/errors";
import {
  getQueueStateSummary,
  isQueueAcceptingJoins,
} from "../../utils/queueStatus";
import { Badge, Button, Card, CardHeader, CardTitle, CardDescription, CardFooter } from "../components/ui";
import { ResponsiveDrawer } from "../components/vendor/ResponsiveDrawer";
import { useVendorDetails } from "../components/vendor/useVendorDetails";
import RichCampaignDescription from "../../components/RichCampaignDescription";

const defaultCover =
  "/illustrations/generated/hero-queue-scene-transparent.png";
const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
function LoadError({
  title,
  error,
  retry,
}: {
  title: string;
  error: unknown;
  retry: () => void;
}) {
  return (
    <Alert className="customer-vendor-error" role="alert">
      <strong>{title}</strong>
      <p>{getErrorMessage(error)}</p>
      <Button variant="outline" onClick={retry}>
        Try again
      </Button>
    </Alert>
  );
}
function Stars({ value }: { value: number }) {
  return (
    <span
      className="customer-rating-stars"
      aria-label={`${value} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <IconStar
          key={star}
          aria-hidden="true"
          data-filled={star <= Math.round(value)}
        />
      ))}
    </span>
  );
}
export default function CustomerVendorDetailsPage() {
  const { theme: mode } = useCustomerTheme();
  const fallbackCover =
    mode === "dark"
      ? "/illustrations/generated/hero-queue-scene-transparent.png"
      : defaultCover;
  const fallbackLogo = mode === "dark" ? "/logo-dark.svg" : "/logo.svg";
  const { tenantSlug = "", locationSlug = "" } = useParams();
  const route = useLocation();
  const vendorSectionRef = useRef<HTMLElement>(null);
  const restoredJoinFocus = useRef(false);
  const [params, setParams] = useSearchParams();
  const { token, user } = useAuth();
  const data = useVendorDetails(
    tenantSlug,
    params.get("location") || locationSlug,
    token || undefined,
    user?.id,
  );
  const { vendor, selected } = data;
  useEffect(() => {
    if (vendor && !restoredJoinFocus.current && route.pathname.startsWith("/vendors/") && route.state?.restoreJoinFocus) {
      const section = vendorSectionRef.current;
      (section?.querySelector<HTMLElement>("[data-join-queue-trigger]:not([disabled])") || section)?.focus();
      restoredJoinFocus.current = true;
    }
  }, [vendor, data.queue.data, route.pathname, route.state]);
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewApi, setReviewApi] = useState<CarouselApi>();
  useEffect(() => { if (!reviewApi) return; const update=()=>setReviewIndex(reviewApi.selectedScrollSnap()); reviewApi.on("select", update); update(); return () => {reviewApi.off("select",update);}; },[reviewApi]);
  const [failedCover, setFailedCover] = useState("");
  const [failedLogo, setFailedLogo] = useState("");
  const [selectedServiceSlugs, setSelectedServiceSlugs] = useState<string[]>([]);
  useEffect(() => {
    setSelectedServiceSlugs([]);
  }, [selected?.slug]);
  if (data.profile.isPending) return <p role="status">Loading vendor…</p>;
  if (data.profile.error || !vendor)
    return (
      <>
        <Button variant="outline" render={<Link to="/vendors" />}>
          Back to vendors
        </Button>
        <LoadError
          title="We couldn’t load this vendor"
          error={data.profile.error || "Vendor not found."}
          retry={() => void data.profile.refetch()}
        />
      </>
    );
  const media = resolveVendorProfileMedia(
    vendor.publicBoardTheme?.theme,
    vendor.businessProfileTheme?.theme,
  );
  const cover = media?.backgroundImageUrl || fallbackCover;
  const logo = media?.logoUrl || vendor.imageUrl || fallbackLogo;
  const currentQueue = data.queue.data;
  const queueType = currentQueue?.location?.queueType || "simple";
  const simpleQueueAvailable = queueType === "simple";
  const queueSummary = currentQueue ? getQueueStateSummary(currentQueue) : null;
  const bookingQuery = new URLSearchParams();
  if (selected) bookingQuery.set("location", selected.slug);
  if (selectedServiceSlugs.length) {
    bookingQuery.set("services", selectedServiceSlugs.join(","));
  }
  const bookingPath = `/vendors/${encodeURIComponent(vendor.slug)}/book?${bookingQuery}`;
  return (
    <section className="customer-vendor-details" ref={vendorSectionRef} tabIndex={-1}>
      <div className="customer-vendor-back">
        <Button
          variant="outline"
          size="icon"
          aria-label="Back to vendors"
          render={<Link to="/vendors" />}
        >
          <IconArrowLeft />
        </Button>
      </div>
      <div className="customer-vendor-hero">
        <img
          className={
            cover === fallbackCover || failedCover === cover ? "is-default" : ""
          }
          src={failedCover === cover ? fallbackCover : cover}
          alt=""
          onError={() => setFailedCover(cover)}
        />
        <div className="customer-vendor-hero-tools">
          {token ? (
            <Button
              variant="outline"
              size="icon"
              aria-label={
                data.favorite ? "Remove from favorites" : "Add to favorites"
              }
              aria-pressed={data.favorite}
              disabled={
                data.favorites.isPending ||
                !!data.favorites.error ||
                data.favoriteChange.isPending
              }
              onClick={() => data.favoriteChange.mutate()}
            >
              <IconHeart fill={data.favorite ? "currentColor" : "none"} />
            </Button>
          ) : null}
          {data.ratings.data ? (
            <a href="#customer-vendor-reviews">
              <IconStar /> {data.ratings.data.rating.average.toFixed(1)}{" "}
              <span className="customer-vendor-rating-count">
                ({data.ratings.data.rating.count} reviews)
              </span>
            </a>
          ) : null}
        </div>
        <div className="customer-vendor-logo" data-logo-fit={logo === media?.logoUrl && failedLogo !== logo && media?.logoFit === "cover" ? "cover" : "contain"}>
          <img
            src={failedLogo === logo ? fallbackLogo : logo}
            alt={`${vendor.name} logo`}
            onError={() => setFailedLogo(logo)}
          />
        </div>
      </div>
      <div className="customer-vendor-content">
        <header className="customer-vendor-heading">
          <div>
            <h1>{vendor.name}</h1>
            <p>{vendor.category}</p>
          </div>
          <ResponsiveDrawer
            title="Contact vendor"
            triggerVariant="ghost"
            trigger={
              <>
                <IconMail />
                Contact vendor
              </>
            }
          >
            <p>
              {vendor.name}
              {selected ? ` · ${selected.name}` : ""}
            </p>
            {selected?.contactEmail ? (
              <p>
                <a href={`mailto:${selected.contactEmail}`}>
                  <IconMail /> {selected.contactEmail}
                </a>
              </p>
            ) : null}
            {selected?.contactPhone ? (
              <p>
                <a href={`tel:${selected.contactPhone}`}>
                  <IconPhone /> {selected.contactPhone}
                </a>
              </p>
            ) : null}
            {!selected?.contactEmail && !selected?.contactPhone ? (
              <p>
                This vendor hasn’t provided contact details for this location.
              </p>
            ) : null}
          </ResponsiveDrawer>
        </header>
        {data.favoriteChange.error ? (
          <LoadError
            title="Your favorite wasn’t updated"
            error={data.favoriteChange.error}
            retry={() => data.favoriteChange.mutate()}
          />
        ) : null}
        {data.favorites.error ? (
          <LoadError
            title="Saved vendors are unavailable"
            error={data.favorites.error}
            retry={() => void data.favorites.refetch()}
          />
        ) : null}
        <div className="customer-vendor-summary">
          <div>
            <strong>{vendor.locations.length}</strong>
            <span>Locations</span>
          </div>
          <div>
            <strong>
              {vendor.capabilities.queue ? "Queue available" : "Bookings"}
            </strong>
            <span>
              {vendor.capabilities.queue
                ? "Choose a location for current status"
                : "Check services and available times"}
            </span>
          </div>
        </div>
        <section>
          <h2>About</h2>
          {vendor.description ? (
            <RichCampaignDescription
              className={aboutExpanded ? "customer-vendor-about" : "customer-vendor-about customer-vendor-about-clamped"}
              content={vendor.description}
            />
          ) : (
            <p>This vendor hasn’t added an introduction yet.</p>
          )}
          {vendor.description && vendor.description.length > 160 ? <Button variant="ghost" onClick={() => setAboutExpanded(v => !v)}>{aboutExpanded ? "Show less" : "Read more"}</Button> : null}
        </section>
        <section>
          <h2>Locations</h2>
          <div
            className="customer-vendor-locations"
            role="group"
            aria-label="Choose a location"
          >
            {vendor.locations.map((location) => (
              <Button variant="location"
                key={location.slug}
                className="customer-vendor-location"
                aria-pressed={selected?.slug === location.slug}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set("location", location.slug);
                  setParams(next, { preventScrollReset: true });
                }}
              >
                <span className="customer-location-icon">
                  <IconMapPin />
                </span>
                <span>
                  <strong>{location.name}</strong>
                  <span>
                    {[location.addressLine1, location.city, location.province]
                      .filter(Boolean)
                      .join(", ") || location.country}
                  </span>
                </span>
              </Button>
            ))}
          </div>
          {!selected ? (
            <p>No locations are available.</p>
          ) : (
            <div className="customer-vendor-hours">
              <ResponsiveDrawer
                title={`${selected.name} operating hours`}
                trigger={
                  <>
                    <IconClock />
                    Operating hours
                  </>
                }
              >
                <p>Times are shown as provided by this location.</p>
                {selected.hours.length ? (
                  days.map((day, index) => {
                    const windows = selected.hours.filter(
                      (hour) => hour.weekday === index && !hour.isClosed,
                    );
                    return (
                      <div className="customer-hours-row" key={day}>
                        <strong>{day}</strong>
                        <span>
                          {windows.length
                            ? windows
                                .map(
                                  (hour) => `${hour.opensAt}–${hour.closesAt}`,
                                )
                                .join(", ")
                            : "Closed"}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <p>Operating hours haven’t been provided.</p>
                )}
              </ResponsiveDrawer>
            </div>
          )}
        </section>
        {vendor.capabilities.queue && selected ? (
          <section
            className="customer-vendor-queue"
            aria-label={`${selected.name} current queue`}
          >
            <h2>
              Current queue{" "}
              <Badge variant="outline">
                {data.queue.error
                  ? "Unavailable"
                  : queueSummary?.label || "Loading"}
              </Badge>
            </h2>
            {data.queue.isPending ? (
              <p role="status">Loading queue status…</p>
            ) : data.queue.error ? (
              <LoadError
                title="Queue status is unavailable"
                error={data.queue.error}
                retry={() => void data.queue.refetch()}
              />
            ) : currentQueue ? (
              <>
                <p>{queueSummary?.message}</p>
                <div className="customer-vendor-queue-stats">
                  <div>
                    <span>Waiting in line</span>
                    <strong>{currentQueue.stats.waitingCount ?? "—"}</strong>
                  </div>
                  <div>
                    <span>Estimated wait</span>
                    <strong>
                      {Number.isFinite(currentQueue.stats.estimatedWaitMinutes)
                        ? `${currentQueue.stats.estimatedWaitMinutes} min`
                        : "—"}
                    </strong>
                  </div>
                  <div>
                    <span>Currently serving</span>
                    <strong>
                      {currentQueue.stats.currentTicketNumber || "—"}
                    </strong>
                  </div>
                </div>
              </>
            ) : (
              <p>Queue status is unavailable.</p>
            )}
            {data.liveInterrupted ? (
              <p role="status">Live updates interrupted. Reconnecting…</p>
            ) : null}
            <Button variant="outline" onClick={() => void data.queue.refetch()}>
              Refresh queue
            </Button>
          </section>
        ) : null}
        <section>
          <h2>Services</h2>
          {!vendor.capabilities.booking ? (
            <p>
              Online bookings aren’t available for this vendor. You can check
              the queue above.
            </p>
          ) : !selected ? (
            <p>Choose a location to view services.</p>
          ) : data.services.isPending ? (
            <p role="status">Loading services…</p>
          ) : data.services.error ? (
            <LoadError
              title="We couldn’t load services"
              error={data.services.error}
              retry={() => void data.services.refetch()}
            />
          ) : data.services.data?.length ? (
            <div className="customer-vendor-services">
              {data.services.data.map((service) => (
                <Card className="customer-vendor-service" data-selected={selectedServiceSlugs.includes(service.slug)} key={service.slug}>
                  <div className="customer-service-image">
                    {service.imageUrl ? (
                      <ResponsiveDrawer
                        title={service.name}
                        trigger={
                          <img
                            src={service.imageUrl}
                            alt={`View ${service.name} image`}
                          />
                        }
                      >
                        <img
                          className="customer-service-expanded-image"
                          src={service.imageUrl}
                          alt={service.name}
                        />
                      </ResponsiveDrawer>
                    ) : (
                      <img src="/logo.svg" alt="" />
                    )}
                  </div>
                  <CardHeader>
                    <CardTitle>{service.name}</CardTitle>
                    <CardDescription>
                      {service.durationMinutes} min ·{" "}
                      <strong>
                        {service.priceDisplay || "Price confirmed by vendor"}
                      </strong>
                    </CardDescription>
                  </CardHeader>
                  <CardFooter><ResponsiveDrawer title={service.name} trigger={<Info aria-label={`About ${service.name}`} />} triggerVariant="ghost">
                    <p>
                      {service.description ||
                        "Ask the vendor for more information about this service."}
                    </p>
                  </ResponsiveDrawer>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`${selectedServiceSlugs.includes(service.slug) ? "Remove" : "Select"} ${service.name}`}
                    aria-pressed={selectedServiceSlugs.includes(service.slug)}
                    onClick={() => setSelectedServiceSlugs((current) => current.includes(service.slug)
                      ? current.filter((slug) => slug !== service.slug)
                      : [...current, service.slug])}
                  >
                    {selectedServiceSlugs.includes(service.slug) ? <Check /> : <Plus />}
                  </Button></CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <p>No services are available for this location.</p>
          )}
        </section>
        <section id="customer-vendor-reviews">
          <h2>Reviews</h2>
          {data.ratings.isPending ? (
            <p role="status">Loading reviews…</p>
          ) : data.ratings.error ? (
            <LoadError
              title="Reviews are unavailable"
              error={data.ratings.error}
              retry={() => void data.ratings.refetch()}
            />
          ) : data.ratings.data ? (
            <>
              <p>
                <Stars value={data.ratings.data.rating.average} />{" "}
                {data.ratings.data.rating.average.toFixed(1)} ·{" "}
                {data.ratings.data.rating.count} ratings
              </p>
              {data.ratings.data.reviews.length ? (
                <Carousel className="customer-review-viewport" opts={{loop:false,align:"start"}} setApi={setReviewApi}><CarouselContent className="customer-review-track">{data.ratings.data.reviews.map((review) => (
                  <CarouselItem key={review.id}><Card className="native-review-card">
                    <div>
                      <time>{new Date(review.created_at).toLocaleDateString("en-PH", {month:"short",day:"numeric",year:"numeric"})}</time><Stars value={review.stars} />
                    </div>
                    <p>{review.comment || "No written review."}</p><p>— {review.customer_display_name}</p>
                    {review.vendor_reply ? (
                      <p>
                        <strong>Vendor reply:</strong> {review.vendor_reply}
                      </p>
                    ) : null}
                  </Card></CarouselItem>
                ))}</CarouselContent></Carousel>
              ) : (
                <p>No reviews yet.</p>
              )}
              <div className="review-dots" role="group" aria-label="Review slides">{data.ratings.data.reviews.map((review,index) => <Button variant="ghost" key={review.id} type="button" aria-label={`Review ${index+1}`} aria-current={index === reviewIndex ? "true" : undefined} onClick={() => reviewApi?.scrollTo(index)}><span /></Button>)}</div>
              <ResponsiveDrawer title="All reviews" trigger="View all reviews">
                <VendorReviews slug={vendor.slug} />
              </ResponsiveDrawer>
            </>
          ) : null}
        </section>
      </div>
      <footer className="customer-vendor-actions">
        {vendor.capabilities.booking && selected ? (
          <Button variant="outline" render={<Link to={bookingPath} />}>
            Book
          </Button>
        ) : (
          <Button variant="outline" disabled>
            Book
          </Button>
        )}
        {vendor.capabilities.queue &&
        selected &&
        currentQueue &&
        !data.queue.error &&
        simpleQueueAvailable &&
        isQueueAcceptingJoins(currentQueue) ? (
          <Button
            data-join-queue-trigger
            render={
              <Link
                to={`/join/${encodeURIComponent(vendor.slug)}/${encodeURIComponent(selected.slug)}`}
              />
            }
          >
            Join queue
          </Button>
        ) : queueType !== "simple" && vendor.capabilities.booking && selected ? (
          <Button data-booking-flow-trigger render={<Link to={bookingPath} />}>Book services</Button>
        ) : (
          <Button disabled>Join queue</Button>
        )}
      </footer>
    </section>
  );
}
