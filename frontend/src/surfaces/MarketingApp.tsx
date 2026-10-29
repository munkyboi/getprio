import { Route, Routes } from "react-router-dom";
import LandingPage from "../marketing/LandingPage";
import PrivacyPolicyPage from "../marketing/PrivacyPolicyPage";
import TermsPage from "../marketing/TermsPage";
import HelpPage from "../marketing/HelpPage";
import ContactPage from "../marketing/ContactPage";
import NotFoundPage from "../marketing/NotFoundPage";
import MarketingShell from "../marketing/MarketingShell";
import { Toaster } from "@vendor/components/ui/toast";
import UniversalAuthPage from "../pages/UniversalAuthPage";
import { PublicThemeProvider } from "./PublicTheme";
export default function MarketingApp() {
  return <PublicThemeProvider><Toaster><MarketingShell><Routes>
    <Route path="/" element={<LandingPage />} />
    {["/login", "/register", "/register/customer", "/register/vendor"].map(path => <Route key={path} path={path} element={<UniversalAuthPage />} />)}
    <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
    <Route path="/terms" element={<TermsPage />} />
    <Route path="/help" element={<HelpPage />} />
    <Route path="/contact" element={<ContactPage />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes></MarketingShell></Toaster></PublicThemeProvider>;
}
