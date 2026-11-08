/** Dialog, sheet (side/bottom drawer), dropdown menu, tooltip, popover — all Radix-based. */
import { X } from 'lucide-react';
import { Dialog as D, DropdownMenu as DM, Popover as P, Tooltip as T } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ─── Dialog ──────────────────────────────────────────────────────────────────

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

function Overlay({ className, ...props }: ComponentProps<typeof D.Overlay>) {
  return (
    <D.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=open]:animate-in',
        className,
      )}
      {...props}
    />
  );
}

export function DialogContent({
  className,
  children,
  hideClose,
  ...props
}: ComponentProps<typeof D.Content> & { hideClose?: boolean }) {
  return (
    <D.Portal>
      <Overlay />
      <D.Content
        className={cn(
          'fixed z-50 flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto border bg-card p-5 shadow-xl outline-none data-[state=closed]:animate-out data-[state=open]:animate-in',
          // Bottom sheet on phones, centred dialog on larger screens.
          'inset-x-0 bottom-0 rounded-t-2xl pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl',
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <D.Close className="absolute top-4 right-4 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </D.Close>
        )}
      </D.Content>
    </D.Portal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 pr-8', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof D.Title>) {
  return <D.Title className={cn('text-lg leading-tight font-semibold', className)} {...props} />;
}

export function DialogDescription({ className, ...props }: ComponentProps<typeof D.Description>) {
  return <D.Description className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

// ─── Sheet (side drawer) ─────────────────────────────────────────────────────

export function SheetContent({
  className,
  children,
  side = 'right',
  title,
  ...props
}: ComponentProps<typeof D.Content> & { side?: 'left' | 'right'; title: string }) {
  return (
    <D.Portal>
      <Overlay />
      <D.Content
        className={cn(
          'fixed inset-y-0 z-50 flex w-full flex-col bg-card shadow-xl outline-none data-[state=closed]:animate-out data-[state=open]:animate-in sm:max-w-xl',
          side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
          className,
        )}
        {...props}
      >
        <D.Title className="sr-only">{title}</D.Title>
        {children}
        <D.Close className="absolute top-4 right-4 cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="size-5" />
          <span className="sr-only">Close</span>
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}

// ─── Dropdown menu ───────────────────────────────────────────────────────────

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = 'end',
  ...props
}: ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'z-50 min-w-48 overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in',
          className,
        )}
        {...props}
      />
    </DM.Portal>
  );
}

export function DropdownMenuItem({
  className,
  destructive,
  ...props
}: ComponentProps<typeof DM.Item> & { destructive?: boolean }) {
  return (
    <DM.Item
      className={cn(
        'relative flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground',
        destructive &&
          'text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive [&_svg]:text-destructive',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof DM.Label>) {
  return (
    <DM.Label
      className={cn('px-2.5 py-1.5 text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DM.Separator>) {
  return <DM.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />;
}

// ─── Tooltip & popover ───────────────────────────────────────────────────────

export const TooltipProvider = T.Provider;

export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <T.Root delayDuration={200}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-64 rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-md data-[state=delayed-open]:animate-in"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;

export function PopoverContent({
  className,
  align = 'start',
  sideOffset = 6,
  ...props
}: ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg outline-none data-[state=open]:animate-in',
          className,
        )}
        {...props}
      />
    </P.Portal>
  );
}
