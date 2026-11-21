import { Route, Routes } from "react-router-dom";
import LandingPage from "../pages/LandingPage";
import PrivacyPolicyPage from "../pages/PrivacyPolicyPage";
import TermsPage from "../pages/TermsPage";
import HelpPage from "../pages/HelpPage";
import ContactPage from "../pages/ContactPage";
import NotFoundPage from "../pages/NotFoundPage";
import PublicShell from "./PublicShell";
import UniversalAuthPage from "../pages/UniversalAuthPage";
import { PublicThemeProvider } from "./PublicTheme";
// Keep the universal auth stylesheet in the Marketing entry chunk. The auth
// route is the public landing surface and must not depend on route discovery
// to load its card, field, OAuth, and responsive layout styles.
import "../pages/universal-auth.css";
export default function MarketingApp() {
  return <PublicThemeProvider><PublicShell marketing><Routes>
    <Route path="/" element={<LandingPage />} />
    {["/login", "/register", "/register/customer", "/register/vendor"].map(path => <Route key={path} path={path} element={<UniversalAuthPage />} />)}
    <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
    <Route path="/terms" element={<TermsPage />} />
    <Route path="/help" element={<HelpPage />} />
    <Route path="/contact" element={<ContactPage />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes></PublicShell></PublicThemeProvider>;
}
