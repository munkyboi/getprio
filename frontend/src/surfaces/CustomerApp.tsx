import { CustomerMaintenance, CustomerLoading, CustomerNotFound, CustomerOAuthCallback, CustomerLoginFallback, CustomerRegistrationFallback } from "../customer/components/CustomerFallbackPresentations";
import { Route, Routes, Navigate, useLocation, useParams } from "react-router-dom";
import LoginPage from "../pages/LoginPage";
import RegisterCustomerPage from "../pages/RegisterCustomerPage";
import OAuthCallbackPage from "../pages/OAuthCallbackPage";
import CustomerExplorePage from "../customer/pages/CustomerExplorePage";
import CustomerVendorDetailsPage from "../customer/pages/CustomerVendorDetailsPage";
import CustomerBookingRequestPage from "../customer/pages/CustomerBookingRequestPage";
import CustomerBookingDetailsViewPage from "../customer/pages/CustomerBookingDetailsViewPage";
import CustomerJoinEntryPage from "../customer/pages/CustomerJoinEntryPage";
import CustomerListsPage from "../customer/pages/CustomerListsPage";
import CustomerFavoritesPage from "../customer/pages/CustomerFavoritesPage";
import CustomerNotificationsPage from "../customer/pages/CustomerNotificationsPage";
import CustomerHomePage from "../customer/pages/CustomerHomePage";
import CustomerAccountViewPage from "../customer/pages/CustomerAccountViewPage";
import CustomerQueueJoinPage, {CustomerPaymentReturnPage} from "../customer/pages/CustomerQueueJoinPage";
import CustomerTicketDetailsPage from "../customer/pages/CustomerTicketDetailsPage";

import MaintenanceBoundary from "../components/MaintenanceBoundary";
import { JOINED_QUEUE_ROUTE_PATH, LEGACY_MONITOR_ROUTE_PATH, MONITOR_ROUTE_PATH } from "../queuePaths";
import CustomerShell from "../customer/CustomerShell";
function CustomerHome() { return <CustomerExplorePage />; }
function LegacyTicketRedirect() {
  const { tenantSlug, locationSlug } = useParams(); const { search } = useLocation();
  return <Navigate replace to={`/ticket/${tenantSlug}${locationSlug ? `/${locationSlug}` : ""}${search}`} />;
}
const customerLegacyRoutes: Record<string, string> = {
  "/account": "/dashboard",
  "/account/dashboard": "/dashboard",
  "/account/lists": "/lists",
  "/account/tickets": "/lists/tickets",
  "/account/bookings": "/lists/bookings",
  "/account/settings": "/settings",
  "/account/notification-settings": "/settings/notification",
  "/account/notifications": "/inbox",
};
function CustomerLegacyRedirect() {
  const location = useLocation();
  const destination = customerLegacyRoutes[location.pathname] || "/dashboard";
  return <Navigate replace to={{ pathname: destination, search: location.search, hash: location.hash }} />;
}
function CustomerLegacyBookingRedirect() {
  const { bookingId } = useParams();
  const location = useLocation();
  return <Navigate replace to={{ pathname: `/lists/bookings/${bookingId}`, search: location.search, hash: location.hash }} />;
}
export default function CustomerApp() {
  return <MaintenanceBoundary renderPresentation={CustomerMaintenance}><CustomerShell><Routes>
    <Route path="/" element={<CustomerHome />} />
    <Route path="/login" element={<LoginPage renderPresentation={CustomerLoginFallback} renderLoading={CustomerLoading} />} />
    <Route path="/register" element={<RegisterCustomerPage renderPresentation={CustomerRegistrationFallback} renderLoading={CustomerLoading} />} />
    <Route path="/register/customer" element={<RegisterCustomerPage renderPresentation={CustomerRegistrationFallback} renderLoading={CustomerLoading} />} />
    <Route path="/oauth/callback" element={<OAuthCallbackPage renderPresentation={CustomerOAuthCallback} />} />
    <Route path="/dashboard" element={<CustomerHomePage />} />
    <Route path="/lists" element={<CustomerListsPage />} />
    <Route path="/lists/tickets" element={<CustomerAccountViewPage />} />
    <Route path="/lists/bookings" element={<CustomerAccountViewPage />} />
    <Route path="/settings" element={<CustomerAccountViewPage />} />
    <Route path="/settings/notification" element={<CustomerAccountViewPage />} />
    <Route path="/inbox" element={<CustomerNotificationsPage />} />
    <Route path="/lists/bookings/:bookingId" element={<CustomerBookingDetailsViewPage />} />
    {Object.keys(customerLegacyRoutes).map(path => <Route key={path} path={path} element={<CustomerLegacyRedirect />} />)}
    <Route path="/account/dashboard-prototype" element={<Navigate replace to="/dashboard" />} />
    <Route path="/account/profile" element={<Navigate replace to="/settings" />} />
    <Route path="/account/bookings/:bookingId" element={<CustomerLegacyBookingRedirect />} />
    <Route path="/account/favorites" element={<CustomerFavoritesPage />} />
    {["tickets", "bookings", "settings", "security"].map(section => <Route key={section} path={`/account/${section}`} element={<CustomerAccountViewPage />} />)}
    <Route path="/vendors" element={<CustomerExplorePage />} />
    <Route path="/vendors/:tenantSlug" element={<CustomerVendorDetailsPage />} />
    <Route path="/vendors/:tenantSlug/book" element={<CustomerBookingRequestPage />} />
    <Route path="/vendors/:tenantSlug/book/:serviceSlug" element={<CustomerBookingRequestPage />} />
    <Route path="/vendors/:tenantSlug/bookings/:bookingId" element={<CustomerBookingRequestPage />} />
    <Route path="/join" element={<CustomerJoinEntryPage />} />
    <Route path="/join/:tenantSlug/:locationSlug?" element={<CustomerQueueJoinPage />} />
    <Route path={JOINED_QUEUE_ROUTE_PATH} element={<CustomerTicketDetailsPage />} />
    <Route path={MONITOR_ROUTE_PATH} element={<LegacyTicketRedirect />} />
    <Route path={LEGACY_MONITOR_ROUTE_PATH} element={<LegacyTicketRedirect />} />
    <Route path="/payment/return" element={<CustomerPaymentReturnPage />} />
    <Route path="*" element={<CustomerNotFound />} />
  </Routes></CustomerShell></MaintenanceBoundary>;
}
