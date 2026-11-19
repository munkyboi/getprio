import { Route, Routes } from "react-router-dom";
import LandingPage from "../pages/LandingPage";
import PrivacyPolicyPage from "../pages/PrivacyPolicyPage";
import TermsPage from "../pages/TermsPage";
import HelpPage from "../pages/HelpPage";
import ContactPage from "../pages/ContactPage";
import NotFoundPage from "../pages/NotFoundPage";
import PublicShell from "./PublicShell";
export default function MarketingApp() {
  return <PublicShell marketing><Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
    <Route path="/terms" element={<TermsPage />} />
    <Route path="/help" element={<HelpPage />} />
    <Route path="/contact" element={<ContactPage />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes></PublicShell>;
}
