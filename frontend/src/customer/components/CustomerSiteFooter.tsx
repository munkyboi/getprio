import { appUrl } from "../../surfaces/surfaceConfig";
import { IconChevronRight, IconBrandFacebook, IconBrandInstagram, IconBrandLinkedin, IconBrandX, IconBrandYoutube } from "@tabler/icons-react";
// Copy and destinations mirror the verified 5190 footer; semantic navigation is not a UI primitive.
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

export function CustomerSiteFooter() {
  return <footer className="customer-site-footer" aria-label="GetPrio footer">
    <div className="customer-site-footer-inner">
      <div className="customer-site-footer-grid">
        <div className="customer-site-footer-brand">
          <a href={appUrl("marketing")} className="customer-site-footer-brandmark"><img src="/logo-dark.svg" alt="" /><strong>GetPrio</strong></a>
          <p>GetPrio connects you with trusted professionals for every task. Book with confidence, pay securely, and get things done.</p>
          <div className="customer-site-footer-socials">{socialLinks.map(({label, Icon, href}) => <a key={label} aria-label={label} href={href} target={href === "#" ? undefined : "_blank"} rel={href === "#" ? undefined : "noopener noreferrer"}><Icon size={18} aria-hidden="true" /></a>)}</div>
        </div>
        {footerGroups.map(group => <nav key={group.title} aria-label={`${group.title} links`}><h2>{group.title}</h2><ul>{group.links.map(link => <li key={link.label}><a href={"href" in link ? link.href : appUrl("marketing", link.to)} target={"href" in link ? "_blank" : undefined} rel={"href" in link ? "noopener noreferrer" : undefined}><span>{link.label}</span><IconChevronRight size={14} aria-hidden="true" /></a></li>)}</ul></nav>)}
      </div>
      <div className="customer-site-footer-bottom"><p>© 2026 MNK-Labs Software Development Services</p><div><a href={appUrl("marketing", "/privacy-policy")}>Privacy Policy</a><a href={appUrl("marketing", "/terms")}>Terms of Service</a></div></div>
    </div>
  </footer>;
}
