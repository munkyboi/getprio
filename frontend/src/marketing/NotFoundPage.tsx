import { Link } from "react-router-dom";
import { IconArrowLeft, IconSearch } from "@tabler/icons-react";
import { Button } from "@vendor/components/ui/button";
export default function NotFoundPage() {
  return <section className="marketing-page marketing-not-found"><div><h1>This page took a detour.</h1><p>The page you’re looking for may have moved, or the link may be out of date.</p><div className="marketing-actions"><Button render={<Link to="/" />}><IconArrowLeft data-icon="inline-start" aria-hidden="true" />Back to home</Button><Button variant="outline" render={<Link to="/vendors" />}><IconSearch data-icon="inline-start" aria-hidden="true" />Browse vendors</Button></div></div><img alt="A customer finding their way with help from a service attendant" src="/illustrations/generated/not-found-wayfinding-transparent.png" /></section>;
}
