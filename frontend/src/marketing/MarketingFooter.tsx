import { Link } from "react-router-dom";
import { IconChevronRight, IconBrandFacebook, IconBrandInstagram, IconBrandLinkedin, IconBrandX, IconBrandYoutube } from "@tabler/icons-react";
import { Separator } from "@vendor/components/ui/separator";
import { appUrl } from "../surfaces/surfaceConfig";
const footerGroups = [
  {
    title: "Platform",
    links: [
      { label: "Browse Services", href: appUrl("customer", "/vendors") },
      { label: "How It Works", to: "/#workflow" },
      { label: "For Customers", href: appUrl("customer", "/register") },
      { label: "For Providers", href: appUrl("vendor", "/register") },
      { label: "Pricing", to: "/#pricing" },
      { label: "Become a Provider", href: appUrl("vendor", "/register") }
    ]
  },
  {
    title: "Developers",
    links: [
      { label: "Developer Platform", href: appUrl("developers") },
      { label: "Guides", href: appUrl("developers", "/guides") },
      { label: "API Reference", href: appUrl("developers", "/reference") }
    ]
  },
  {
    title: "Support",
    links: [
      { label: "Help Center", to: "/help" },
      { label: "FAQs", to: "/help#faq" },
      { label: "Booking Guide", to: "/help?topic=bookings" },
      { label: "Payments & Refunds", to: "/help?topic=payments" },
      { label: "Contact Us", to: "/contact" },
      { label: "Report an Issue", to: "/contact" }
    ]
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", to: "/privacy-policy" },
      { label: "Terms of Service", to: "/terms" },
      { label: "Cookies & Storage", to: "/privacy-policy#cookies" },
      { label: "Acceptable Use", to: "/terms#user-conduct" },
    ]
  }
] as const;

const socialLinks = [
  { label: "Facebook", Icon: IconBrandFacebook, href: "https://www.facebook.com/people/GetPrio/61591068855439/" },
  { label: "X", Icon: IconBrandX, href: "#" },
  { label: "Instagram", Icon: IconBrandInstagram, href: "https://www.instagram.com/getprio.online/" },
  { label: "LinkedIn", Icon: IconBrandLinkedin, href: "#" },
  { label: "YouTube", Icon: IconBrandYoutube, href: "#" }
] as const;

export default function MarketingFooter() {
  return <footer className="marketing-footer"><div className="marketing-container">
    <div className="marketing-footer-grid"><div className="marketing-footer-brand">
      <div className="marketing-brand"><img src="/logo-dark.svg" alt="" /><strong>GetPrio</strong></div>
      <p>GetPrio connects you with trusted professionals for every task. Book with confidence, pay securely, and get things done.</p>
      <div className="marketing-social-links">{socialLinks.map(({ label, Icon, href }) => <a key={label} aria-label={label} href={href} target={href === "#" ? undefined : "_blank"} rel={href === "#" ? undefined : "noopener noreferrer"}><Icon aria-hidden="true" size={18} /></a>)}</div>
    </div>{footerGroups.map(group => <section key={group.title}><h2>{group.title}</h2><ul>{group.links.map(link => <li key={link.label}>{"href" in link ? <a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}<IconChevronRight aria-hidden="true" size={14} /></a> : <Link to={link.to} reloadDocument={link.to.includes("#")}>{link.label}<IconChevronRight aria-hidden="true" size={14} /></Link>}</li>)}</ul></section>)}</div>
    <Separator /><div className="marketing-footer-bottom"><p>© 2026 MNK-Labs Software Development Services</p><div><a href={appUrl("marketing", "/privacy-policy")}>Privacy Policy</a><a href={appUrl("marketing", "/terms")}>Terms of Service</a></div></div>
  </div></footer>;
}
