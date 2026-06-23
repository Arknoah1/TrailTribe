import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "whitespace-nowrap inline-flex items-center rounded-md border-[1.5px] border-[#0a0c10] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-all shadow-cel-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cel-interactive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground",
        secondary:
          "bg-secondary text-secondary-foreground",
        destructive:
          "bg-destructive text-destructive-foreground",
        outline: "bg-transparent text-foreground",
        practice: "bg-primary text-primary-foreground",
        race: "bg-accent text-accent-foreground",
        social: "bg-muted text-muted-foreground",
        cancelled: "bg-destructive text-destructive-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
