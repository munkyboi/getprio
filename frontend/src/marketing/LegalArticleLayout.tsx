import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@vendor/components/ui/card";
import { Separator } from "@vendor/components/ui/separator";
type TocItem = { id: string; label: string };
export default function LegalArticleLayout({ children, lastUpdated, title, toc }: { children: ReactNode; lastUpdated: string; title: string; toc: TocItem[] }) {
  return <div className="marketing-legal-layout"><header id="top"><h1>{title}</h1><p>Last updated: {lastUpdated}</p></header><article>{children}</article><aside aria-label="Table of contents"><Card><CardHeader><CardTitle>Table of contents</CardTitle></CardHeader><CardContent><nav>{toc.map((item, index) => <a href={`#${item.id}`} key={item.id}>{index + 1}. {item.label}</a>)}</nav><Separator /><a href="#top">Back to top ↑</a></CardContent></Card></aside></div>;
}
