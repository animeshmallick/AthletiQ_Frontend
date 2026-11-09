/** Dialog, sheet (side/bottom drawer), dropdown menu, tooltip, popover — all Radix-based. */
import { X } from 'lucide-react';
import { Dialog as D, DropdownMenu as DM, Popover as P, Tooltip as T } from 'radix-ui';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { useBackToClose } from '@/app/back-stack';
import { usePhone } from '@/lib/use-phone';
import { useSwipeDismiss } from './swipe-dismiss';
import { cn } from '@/lib/utils';

/**
 * Open state for an overlay root (controlled or not), registered so that the phone's back
 * button / gesture closes it instead of leaving the screen.
 */
function useOverlayOpen({
  open: openProp,
  defaultOpen,
  onOpenChange,
}: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [inner, setInner] = useState(defaultOpen ?? false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : inner;
  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) setInner(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );
  useBackToClose(open, () => setOpen(false));
  return { open, onOpenChange: setOpen };
}

// ─── Dialog ──────────────────────────────────────────────────────────────────

export function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: ComponentProps<typeof D.Root>) {
  return <D.Root {...props} {...useOverlayOpen({ open, defaultOpen, onOpenChange })} />;
}
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
  const swipe = useSwipeDismiss();
  return (
    <D.Portal>
      <Overlay />
      <D.Content
        {...swipe}
        className={cn(
          // Never taller than the screen below the status bar (Android edge-to-edge, iOS notch).
          'fixed z-50 flex max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-1rem))] w-full flex-col gap-2.5 overflow-y-auto border bg-card p-3 pt-5 shadow-e3 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in sm:gap-4 sm:p-5',
          // Bottom sheet on phones, centred dialog on larger screens.
          'inset-x-0 bottom-0 rounded-t-3xl pb-[max(0.75rem,env(safe-area-inset-bottom))] before:absolute before:top-2 before:left-1/2 before:h-1.5 before:w-10 before:-translate-x-1/2 before:rounded-full before:bg-muted-foreground/25 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:before:hidden',
          className,
        )}
        {...props}
      >
        {children}
        {/* Phones: drag from here to dismiss (touch only, leaves the corners for buttons). */}
        <div aria-hidden className="absolute inset-x-14 top-0 z-20 h-10 touch-none sm:hidden" />
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
      // One row everywhere; on phones the buttons share the width equally.
      className={cn(
        'mt-1 flex items-center gap-2 *:flex-1 sm:justify-end sm:*:flex-none',
        className,
      )}
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

// ─── Phone bottom sheet (shared by popovers and menus) ───────────────────────

const SHEET_CLASS =
  'fixed inset-x-0 bottom-0 z-50 flex max-h-[min(85dvh,calc(100dvh-env(safe-area-inset-top)-1rem))] w-full max-w-none flex-col overflow-y-auto rounded-t-3xl border-t bg-card px-3 pt-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-card-foreground shadow-e3 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in before:absolute before:top-2 before:left-1/2 before:h-1.5 before:w-10 before:-translate-x-1/2 before:rounded-full before:bg-muted-foreground/25';

function BottomSheet({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  const swipe = useSwipeDismiss();
  return (
    <D.Portal>
      <Overlay />
      <D.Content aria-describedby={undefined} className={cn(SHEET_CLASS, className)} {...swipe}>
        <D.Title className="sr-only">{title}</D.Title>
        {children}
        {/* Phones: drag from here to dismiss (touch only, leaves the corners for buttons). */}
        <div aria-hidden className="absolute inset-x-14 top-0 z-20 h-10 touch-none sm:hidden" />
      </D.Content>
    </D.Portal>
  );
}

/** Whether a popover / menu renders as a phone bottom sheet, and how to close it. */
const SheetModeContext = createContext<{ sheet: boolean; close: () => void }>({
  sheet: false,
  close: () => {},
});

function useSheetMode(onOpenChange: (open: boolean) => void) {
  const sheet = usePhone();
  return useMemo(() => ({ sheet, close: () => onOpenChange(false) }), [sheet, onOpenChange]);
}

// ─── Sheet (side drawer; bottom sheet on phones) ─────────────────────────────

export function SheetContent({
  className,
  children,
  side = 'right',
  title,
  ...props
}: ComponentProps<typeof D.Content> & { side?: 'left' | 'right'; title: string }) {
  const swipe = useSwipeDismiss();
  return (
    <D.Portal>
      <Overlay />
      <D.Content
        {...swipe}
        className={cn(
          // Phones: a bottom sheet like every other popup. Larger screens: a side drawer.
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-1rem))] w-full flex-col overflow-hidden rounded-t-3xl border-t bg-card pt-3 pb-[env(safe-area-inset-bottom)] shadow-xl outline-none before:absolute before:top-2 before:left-1/2 before:z-10 before:h-1.5 before:w-10 before:-translate-x-1/2 before:rounded-full before:bg-muted-foreground/25 data-[state=closed]:animate-out data-[state=open]:animate-in',
          'sm:inset-x-auto sm:inset-y-0 sm:max-h-none sm:max-w-xl sm:rounded-none sm:border-t-0 sm:pt-[env(safe-area-inset-top)] sm:before:hidden',
          side === 'right' ? 'sm:right-0 sm:border-l' : 'sm:left-0 sm:border-r',
          className,
        )}
        {...props}
      >
        <D.Title className="sr-only">{title}</D.Title>
        {children}
        {/* Phones: drag from here to dismiss (touch only, leaves the corners for buttons). */}
        <div aria-hidden className="absolute inset-x-14 top-0 z-20 h-10 touch-none sm:hidden" />
        <D.Close className="absolute top-4 right-4 cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground sm:top-[calc(1rem+env(safe-area-inset-top))]">
          <X className="size-5" />
          <span className="sr-only">Close</span>
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}

// ─── Dropdown menu (action sheet on phones) ──────────────────────────────────

export function DropdownMenu({
  open,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: ComponentProps<typeof DM.Root>) {
  const state = useOverlayOpen({ open, defaultOpen, onOpenChange });
  const mode = useSheetMode(state.onOpenChange);
  return (
    <SheetModeContext.Provider value={mode}>
      {mode.sheet ? (
        <D.Root {...state}>{children}</D.Root>
      ) : (
        <DM.Root {...props} {...state}>
          {children}
        </DM.Root>
      )}
    </SheetModeContext.Provider>
  );
}

export function DropdownMenuTrigger(props: ComponentProps<typeof DM.Trigger>) {
  const { sheet } = useContext(SheetModeContext);
  return sheet ? <D.Trigger {...props} /> : <DM.Trigger {...props} />;
}

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = 'end',
  title = 'Actions',
  children,
  ...props
}: ComponentProps<typeof DM.Content> & { title?: string }) {
  const { sheet } = useContext(SheetModeContext);
  if (sheet)
    return (
      <BottomSheet title={title}>
        <div role="menu" aria-label={title} className="space-y-0.5">
          {children}
        </div>
      </BottomSheet>
    );
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
      >
        {children}
      </DM.Content>
    </DM.Portal>
  );
}

const ITEM_CLASS =
  'relative flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground';

export function DropdownMenuItem({
  className,
  destructive,
  onSelect,
  disabled,
  children,
  ...props
}: ComponentProps<typeof DM.Item> & { destructive?: boolean }) {
  const { sheet, close } = useContext(SheetModeContext);
  if (sheet)
    return (
      <button
        type="button"
        role="menuitem"
        disabled={disabled}
        onClick={() => {
          close();
          onSelect?.(new Event('select', { cancelable: true }));
        }}
        className={cn(
          ITEM_CLASS,
          'min-h-12 px-3 text-[15px] hover:bg-muted active:bg-muted disabled:opacity-50',
          destructive && 'text-destructive [&_svg]:text-destructive',
          className,
        )}
      >
        {children}
      </button>
    );
  return (
    <DM.Item
      className={cn(
        ITEM_CLASS,
        destructive &&
          'text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive [&_svg]:text-destructive',
        className,
      )}
      onSelect={onSelect}
      disabled={disabled}
      {...props}
    >
      {children}
    </DM.Item>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof DM.Label>) {
  const { sheet } = useContext(SheetModeContext);
  const cls = cn('px-2.5 py-1.5 text-xs font-medium text-muted-foreground', className);
  if (sheet) return <div className={cls}>{props.children}</div>;
  return <DM.Label className={cls} {...props} />;
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DM.Separator>) {
  const { sheet } = useContext(SheetModeContext);
  if (sheet) return <div role="separator" className={cn('my-1 h-px bg-border', className)} />;
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

export function Popover({
  open,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: ComponentProps<typeof P.Root>) {
  const state = useOverlayOpen({ open, defaultOpen, onOpenChange });
  const mode = useSheetMode(state.onOpenChange);
  return (
    <SheetModeContext.Provider value={mode}>
      {mode.sheet ? (
        <D.Root {...state}>{children}</D.Root>
      ) : (
        <P.Root {...props} {...state}>
          {children}
        </P.Root>
      )}
    </SheetModeContext.Provider>
  );
}

export function PopoverTrigger(props: ComponentProps<typeof P.Trigger>) {
  const { sheet } = useContext(SheetModeContext);
  return sheet ? <D.Trigger {...props} /> : <P.Trigger {...props} />;
}

export function PopoverContent({
  className,
  align = 'start',
  sideOffset = 6,
  title = 'Options',
  children,
  ...props
}: ComponentProps<typeof P.Content> & { title?: string }) {
  const { sheet } = useContext(SheetModeContext);
  if (sheet)
    return (
      <BottomSheet title={title} className={cn(className, 'w-full max-w-none p-3 pt-5')}>
        {children}
      </BottomSheet>
    );
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
      >
        {children}
      </P.Content>
    </P.Portal>
  );
}
