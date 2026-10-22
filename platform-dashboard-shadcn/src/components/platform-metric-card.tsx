import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { Card, CardContent, CardDescription } from "@/components/ui/card"
import { cn } from "cn"

type PlatformMetricCardProps = {
  label: string
  value: ReactNode
  icon: LucideIcon
  iconClassName: string
  supportingContent: ReactNode
}

export function PlatformMetricCard({ label, value, icon: Icon, iconClassName, supportingContent }: PlatformMetricCardProps) {
  return <Card size="sm" className="shadow-none">
    <CardContent className="grid gap-2">
      <div className="flex items-center gap-2">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-md", iconClassName)}><Icon aria-hidden="true" /></span>
        <CardDescription>{label}</CardDescription>
      </div>
      <div className="text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{supportingContent}</div>
    </CardContent>
  </Card>
}
