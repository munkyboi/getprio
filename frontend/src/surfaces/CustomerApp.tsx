import { Route, Routes, Navigate, useLocation, useParams } from "react-router-dom";
import LoginPage from "../pages/LoginPage";
import RegisterCustomerPage from "../pages/RegisterCustomerPage";
import OAuthCallbackPage from "../pages/OAuthCallbackPage";
import CustomerAccountPage from "../pages/CustomerAccountPage";
import CustomerDashboardPage from "../pages/CustomerDashboardPage";
import CustomerBookingDetailPage from "../pages/CustomerBookingDetailPage";
import VendorDiscoveryPage from "../pages/VendorDiscoveryPage";
import VendorProfilePage from "../pages/VendorProfilePage";
import BookingRequestPage from "../pages/BookingRequestPage";
import JoinQueuePage from "../pages/JoinQueuePage";
import JoinedQueuePage from "../pages/JoinedQueuePage";
import PaymentReturnPage from "../pages/PaymentReturnPage";
import NotFoundPage from "../pages/NotFoundPage";
import MaintenanceBoundary from "../components/MaintenanceBoundary";
import { JOINED_QUEUE_ROUTE_PATH, LEGACY_MONITOR_ROUTE_PATH, MONITOR_ROUTE_PATH } from "../queuePaths";
import PublicShell from "./PublicShell";
import PublicAuthRedirect, { publicUniversalAuthEnabled } from "./PublicAuthRedirect";
function CustomerHome() { return <VendorDiscoveryPage />; }
function CustomerAuthEntry({ mode }: { mode: "login" | "register" }) {
  const location = useLocation();
  if (mode === "register" && location.state) return <RegisterCustomerPage />;
  if (new URLSearchParams(location.search).has("resetToken")) return <LoginPage />;
  return <PublicAuthRedirect surface="customer" mode={mode} />;
}
function LegacyTicketRedirect() {
  const { tenantSlug, locationSlug } = useParams(); const { search } = useLocation();
  return <Navigate replace to={`/ticket/${tenantSlug}${locationSlug ? `/${locationSlug}` : ""}${search}`} />;
}
export default function CustomerApp() {
  return <MaintenanceBoundary><PublicShell><Routes>
    <Route path="/" element={<CustomerHome />} />
    <Route path="/login" element={publicUniversalAuthEnabled ? <CustomerAuthEntry mode="login" /> : <LoginPage />} />
    <Route path="/register" element={publicUniversalAuthEnabled ? <CustomerAuthEntry mode="register" /> : <RegisterCustomerPage />} />
    <Route path="/register/customer" element={publicUniversalAuthEnabled ? <CustomerAuthEntry mode="register" /> : <RegisterCustomerPage />} />
    <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
    <Route path="/account" element={<Navigate replace to="/account/dashboard" />} />
    <Route path="/account/dashboard" element={<CustomerDashboardPage />} />
    <Route path="/account/dashboard-prototype" element={<Navigate replace to="/account/dashboard" />} />
    <Route path="/account/profile" element={<Navigate replace to="/account/settings" />} />
    <Route path="/account/bookings/:bookingId" element={<CustomerBookingDetailPage />} />
    {["tickets", "bookings", "settings", "notifications", "security"].map(section => <Route key={section} path={`/account/${section}`} element={<CustomerAccountPage />} />)}
    <Route path="/vendors" element={<VendorDiscoveryPage />} />
    <Route path="/vendors/:tenantSlug" element={<VendorProfilePage />} />
    <Route path="/vendors/:tenantSlug/book" element={<BookingRequestPage />} />
    <Route path="/vendors/:tenantSlug/book/:serviceSlug" element={<BookingRequestPage />} />
    <Route path="/vendors/:tenantSlug/bookings/:bookingId" element={<BookingRequestPage />} />
    <Route path="/join/:tenantSlug/:locationSlug?" element={<JoinQueuePage />} />
    <Route path={JOINED_QUEUE_ROUTE_PATH} element={<JoinedQueuePage />} />
    <Route path={MONITOR_ROUTE_PATH} element={<LegacyTicketRedirect />} />
    <Route path={LEGACY_MONITOR_ROUTE_PATH} element={<LegacyTicketRedirect />} />
    <Route path="/payment/return" element={<PaymentReturnPage />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes></PublicShell></MaintenanceBoundary>;
}
