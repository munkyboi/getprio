import "./auth-links.css";
import { Link } from "react-router-dom";
import { appUrl, currentSurface } from "./surfaceConfig";

/** Cross-app links deliberately carry no session, next path, or registration payload. */
export function AuthAppLinks({ surface, showOwnLogin = false }: { surface: "customer" | "vendor"; showOwnLogin?: boolean }) {
  const other = surface === "vendor" ? "customer" : "vendor";
  const label = other === "customer" ? "Customer" : "Vendor";
  if (!currentSurface) return null;
  return <nav aria-label="Switch application" className="surface-auth-links">
    <p><a href={appUrl(other, "/login")}>{label} login</a>{" · "}<a href={appUrl(other, "/register")}>{label} registration</a></p>
    {showOwnLogin ? <p><Link to="/login">Already have an account? Sign in</Link></p> : null}
    <a href={appUrl("marketing")}>GetPrio home</a>
  </nav>;
}
