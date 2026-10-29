import { Link } from "react-router-dom";
import { IconArrowUpRight, IconMail, IconBuildingStore } from "@tabler/icons-react";
import { Button } from "@vendor/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@vendor/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@vendor/components/ui/accordion";
const supportEmail = String(import.meta.env.VITE_GETPRIO_SUPPORT_EMAIL || "").trim() || "support@getprio.online";
export default function ContactPage() {
  return <section className="marketing-page"><header><h1>How can we help?</h1><p>Questions about your account or something not working as expected? Let’s get you to the right place.</p></header>
    <div className="marketing-support-grid"><Card><CardHeader><IconMail aria-hidden="true" /><CardTitle>We’re here to help.</CardTitle><CardDescription>Contact GetPrio for account access, technical issues, payments, or a concern that needs our team’s attention.</CardDescription></CardHeader><CardContent>
      <div className="marketing-actions"><Button render={<a href={`mailto:${supportEmail}`} />}>Email support<IconArrowUpRight data-icon="inline-end" aria-hidden="true" /></Button><a href={`mailto:${supportEmail}`}>{supportEmail}</a></div>
      <p>Opens your email app. You can attach screenshots there.</p><h2>Help us understand what happened</h2><ul><li>The email address you use for GetPrio</li><li>Your booking reference or queue ticket, if relevant</li><li>A short description and a screenshot of the issue</li></ul><p>Never include your password, verification codes, or full payment card details.</p>
    </CardContent></Card><div><Card><CardHeader><IconBuildingStore aria-hidden="true" /><CardTitle>A question for a business?</CardTitle><CardDescription>For service details, availability, or changes to a booking, start with the business you booked with.</CardDescription></CardHeader><CardContent><Button variant="outline" render={<Link to="/vendors" />}>Find your vendor</Button><p>Open their profile to find their contact details.</p></CardContent></Card>
      <h2>Before you reach out</h2><Link to="/help">Browse the Help Center →</Link><Accordion multiple>
        <AccordionItem value="signin"><AccordionTrigger>I can’t sign in</AccordionTrigger><AccordionContent>Use the password reset option on the sign-in page. If you still need help, email our team with the address associated with your account.</AccordionContent></AccordionItem>
        <AccordionItem value="payment"><AccordionTrigger>I have a payment or refund concern</AccordionTrigger><AccordionContent>Include the business name, booking reference, and payment date. Explain what you’ve already discussed with the business so our team has the context.</AccordionContent></AccordionItem>
        <AccordionItem value="report"><AccordionTrigger>I want to report a problem</AccordionTrigger><AccordionContent>Tell us what you were trying to do and what happened instead. Include the page or app screen and any error message you saw.</AccordionContent></AccordionItem>
      </Accordion></div></div>
  </section>;
}
