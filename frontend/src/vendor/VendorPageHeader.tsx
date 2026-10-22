import { Fragment, type ReactNode, type MouseEventHandler } from "react";
import { Link } from "react-router-dom";
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "./components/ui/breadcrumb";
import { Separator } from "./components/ui/separator";

export function VendorPageHeader({ title, eyebrow, description, breadcrumbs, action, onNavigate }: {
  title: string; eyebrow?: string; description: string; breadcrumbs: { label: string; href?: string }[];
  action?: ReactNode; onNavigate?: MouseEventHandler<HTMLAnchorElement>;
}) {
  return <div className="vendor-page-heading">
    <Breadcrumb aria-label="Page breadcrumb"><BreadcrumbList>
      {breadcrumbs.map((item, index) => <Fragment key={`${index}:${item.label}`}>
        {index > 0 ? <BreadcrumbSeparator /> : null}
        <BreadcrumbItem>{item.href ? <BreadcrumbLink render={<Link to={item.href} onClick={onNavigate} />}>{item.label}</BreadcrumbLink> : <BreadcrumbPage>{item.label}</BreadcrumbPage>}</BreadcrumbItem>
      </Fragment>)}
    </BreadcrumbList></Breadcrumb>
    {action}
    {eyebrow ? <p className="vendor-eyebrow">{eyebrow}</p> : null}
    <h1>{title}</h1>
    <p className="vendor-page-description">{description}</p>
    <Separator className="vendor-page-separator" />
  </div>;
}
