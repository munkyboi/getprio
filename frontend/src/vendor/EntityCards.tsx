import type { ReactNode } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "./components/ui/tooltip";

/** Presentational anatomy only: collection state, permissions and mutations stay with callers. */
export function EntityGrid({label,children}:{label:string;children:ReactNode}) {
  return <TooltipProvider><ul className="entity-grid" aria-label={label}>{children}</ul></TooltipProvider>;
}
export function EntityCard({title,badges,children,footer,selected,inactive}:{title:string;badges?:ReactNode;children:ReactNode;footer:ReactNode;selected?:boolean;inactive?:boolean}) {
  return <li><Card className="entity-card" data-selected={selected || undefined} data-inactive={inactive || undefined}>
    <CardHeader><CardTitle><h3>{title}</h3></CardTitle>{badges ? <div className="entity-badges">{badges}</div> : null}</CardHeader>
    <CardContent>{children}</CardContent><CardFooter className="entity-card-footer">{footer}</CardFooter>
  </Card></li>;
}
export function EntityIconAction({label,disabled,onClick,children}:{label:string;disabled?:boolean;onClick:()=>void;children:ReactNode}) {
  return <Tooltip><TooltipTrigger render={<Button size="icon" variant="ghost" aria-label={label} disabled={disabled} onClick={onClick}/>}>{children}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}
