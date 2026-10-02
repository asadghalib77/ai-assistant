"use client";

import * as React from "react";
import { DropdownMenu as Primitive } from "radix-ui";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;
export const DropdownMenuRadioGroup = Primitive.RadioGroup;

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Portal><Primitive.Content sideOffset={sideOffset} className={cn("z-50 min-w-48 rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg", className)} {...props} /></Primitive.Portal>;
}

export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof Primitive.Item>) {
  return <Primitive.Item className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50", className)} {...props} />;
}

export function DropdownMenuRadioItem({ children, className, ...props }: React.ComponentProps<typeof Primitive.RadioItem>) {
  return <Primitive.RadioItem className={cn("relative flex cursor-pointer items-center rounded-lg py-2 pr-3 pl-8 text-sm outline-none data-[highlighted]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50", className)} {...props}><span className="absolute left-2"><Primitive.ItemIndicator><CheckIcon className="size-4" /></Primitive.ItemIndicator></span>{children}</Primitive.RadioItem>;
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof Primitive.Label>) {
  return <Primitive.Label className={cn("px-3 py-2 text-xs font-medium text-muted-foreground", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof Primitive.Separator>) {
  return <Primitive.Separator className={cn("my-1 h-px bg-border", className)} {...props} />;
}
