import type { ReactNode } from "react";
export default function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={id} className="legal-section"><h2>{title}</h2>{children}</section>;
}
