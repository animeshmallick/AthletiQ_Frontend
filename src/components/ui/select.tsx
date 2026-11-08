/**
 * Select: a drop-in replacement for <select> with a polished picker.
 *
 * - Phones (narrow or touch screens): a bottom sheet with large rows, like native app pickers.
 * - Desktop: a popover list under the field with full keyboard support.
 * - Long lists (more than 8 options) get a search box.
 *
 * It keeps a hidden native <select> as the source of truth, so it works unchanged with
 * react-hook-form `register()`, controlled `value`/`onChange`, form submission and `<option>` children.
 */
import { Check, ChevronDown, Lock, Search } from 'lucide-react';
import { Dialog as D, Popover as P } from 'radix-ui';
import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';
import { fieldClass } from './field-styles';

interface Opt {
  value: string;
  label: string;
  disabled: boolean;
  group?: string;
}

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

type OptionLike = { value?: unknown; children?: ReactNode; disabled?: boolean; label?: string };

function collect(children: ReactNode, group?: string, out: Opt[] = []): Opt[] {
  Children.forEach(children, (child) => {
    if (!isValidElement<OptionLike>(child)) return;
    if (child.type === 'option') {
      const label = textOf(child.props.children);
      out.push({
        value: child.props.value === undefined ? label : String(child.props.value),
        label,
        disabled: Boolean(child.props.disabled),
        group,
      });
    } else if (child.type === 'optgroup') {
      collect(child.props.children, child.props.label, out);
    } else if (child.type === Fragment) {
      collect(child.props.children, group, out);
    }
  });
  return out;
}

/** "Select a batch…", "Select…", "—": shown muted in the field, like a placeholder. */
const isPlaceholder = (o: Opt | undefined) =>
  !!o && o.value === '' && /^(select|choose|—|-)/i.test(o.label);

const SHEET_QUERY = '(max-width: 639px), (pointer: coarse)';
function useSheet() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia?.(SHEET_QUERY);
      mq?.addEventListener?.('change', cb);
      return () => mq?.removeEventListener?.('change', cb);
    },
    () => window.matchMedia?.(SHEET_QUERY).matches ?? false,
    () => false,
  );
}

const valueSetter = () =>
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;

export type SelectProps = ComponentProps<'select'> & {
  /** Title of the phone picker; defaults to the field's label. */
  pickerTitle?: string;
};

export function Select({
  className,
  children,
  id: idProp,
  disabled,
  pickerTitle,
  ref,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  'aria-labelledby': ariaLabelledBy,
  ...selectProps
}: SelectProps) {
  const autoId = useId();
  const id = idProp ?? `select-${autoId}`;
  const listId = `${id}-list`;
  const sheet = useSheet();
  const [open, setOpen] = useState(false);
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const options = useMemo(() => collect(children), [children]);

  // Mirror the hidden select's value (it can change via reset(), setValue() or a controlled prop).
  const [domValue, setDomValue] = useState(() =>
    String(selectProps.value ?? selectProps.defaultValue ?? ''),
  );
  // Runs after every render on purpose: reset()/setValue() change the DOM without changing props.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const v = selectRef.current?.value ?? '';
    if (v !== domValue) setDomValue(v);
  });
  const current = selectProps.value !== undefined ? String(selectProps.value) : domValue;
  const selected = options.find((o) => o.value === current);

  const setRefs = (el: HTMLSelectElement | null) => {
    selectRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as { current: HTMLSelectElement | null }).current = el;
  };

  function pick(value: string, { focus = true } = {}) {
    const el = selectRef.current;
    setOpen(false);
    if (el && el.value !== value) {
      valueSetter()?.call(el, value);
      el.dispatchEvent(new Event('change', { bubbles: true })); // fires onChange / RHF
      setDomValue(el.value);
    }
    if (!focus) return;
    // Focus returns to the field right away (so the next key press works), and again after the
    // popover/sheet has finished closing in case it moved focus.
    triggerRef.current?.focus();
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  // A required field with only one real choice (no meaningful "All…" option): select it and lock.
  const ariaRequired = selectProps['aria-required'];
  const required = !!selectProps.required || ariaRequired === true || ariaRequired === 'true';
  const real = options.filter((o) => o.value !== '' && !o.disabled);
  const empty = options.find((o) => o.value === '');
  const onlyChoice =
    required && !selectProps.multiple && real.length === 1 && (!empty || isPlaceholder(empty))
      ? real[0]!
      : null;
  const locked = !!onlyChoice || !!disabled;
  useEffect(() => {
    // Syncing the hidden <select> (and the form) to the only possible choice is the point here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (onlyChoice && current !== onlyChoice.value) pick(onlyChoice.value, { focus: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyChoice?.value, current]);

  function onTriggerKey(e: KeyboardEvent) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      setOpen(true);
    }
  }

  const title =
    pickerTitle ??
    ariaLabel ??
    (typeof document !== 'undefined'
      ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent?.replace(/\*$/, '')
      : undefined) ??
    'Select an option';

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      id={id}
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      disabled={locked}
      title={onlyChoice ? 'Only one option available' : undefined}
      onClick={() => setOpen((o) => !o)}
      onKeyDown={onTriggerKey}
      className={cn(
        fieldClass,
        'h-10 cursor-pointer items-center justify-between gap-2 py-2 text-left',
        open && 'border-ring ring-3 ring-ring/20',
      )}
    >
      <span
        className={cn(
          'truncate',
          (!selected || isPlaceholder(selected)) && 'text-muted-foreground',
        )}
      >
        {selected?.label ?? ''}
      </span>
      {onlyChoice ? (
        <Lock aria-hidden className="size-3.5 shrink-0 text-muted-foreground/70" />
      ) : (
        <ChevronDown
          aria-hidden
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      )}
    </button>
  );

  const list = (
    <OptionList
      id={listId}
      options={options}
      value={current}
      onPick={pick}
      large={sheet}
      autoFocusSearch={!sheet}
    />
  );

  return (
    <div className={cn('relative w-full max-w-full min-w-0', className)} data-slot="select">
      <select
        ref={setRefs}
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        {...selectProps}
      >
        {children}
      </select>

      {sheet ? (
        <>
          {trigger}
          <D.Root open={open} onOpenChange={setOpen}>
            <D.Portal>
              <D.Overlay className="fixed inset-0 z-50 bg-black/45 data-[state=closed]:animate-out data-[state=open]:animate-in" />
              <D.Content
                aria-describedby={undefined}
                onCloseAutoFocus={(e) => {
                  e.preventDefault();
                  triggerRef.current?.focus();
                }}
                className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-3xl bg-card pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl outline-none data-[state=closed]:animate-out data-[state=open]:animate-in"
              >
                <div
                  aria-hidden
                  className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/25"
                />
                <D.Title className="px-5 pt-3 pb-2 text-base font-semibold">{title}</D.Title>
                {list}
              </D.Content>
            </D.Portal>
          </D.Root>
        </>
      ) : (
        <P.Root open={open} onOpenChange={setOpen}>
          <P.Anchor asChild>{trigger}</P.Anchor>
          <P.Portal>
            <P.Content
              align="start"
              sideOffset={6}
              onOpenAutoFocus={(e) => e.preventDefault()}
              onInteractOutside={(e) => {
                // Clicking the field again toggles instead of close-then-reopen.
                if (triggerRef.current?.contains(e.target as Node)) e.preventDefault();
              }}
              className="z-50 flex max-h-[min(22rem,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] min-w-48 flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg data-[state=closed]:animate-out data-[state=open]:animate-in"
            >
              {list}
            </P.Content>
          </P.Portal>
        </P.Root>
      )}
    </div>
  );
}

function OptionList({
  id,
  options,
  value,
  onPick,
  large,
  autoFocusSearch,
}: {
  id: string;
  options: Opt[];
  value: string;
  onPick: (v: string) => void;
  large: boolean;
  autoFocusSearch: boolean;
}) {
  const searchable = options.length > 8;
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      options.findIndex((o) => o.value === value),
    ),
  );
  const listRef = useRef<HTMLDivElement>(null);
  const optId = (i: number) => `${id}-opt-${i}`;

  // Keyboard focus lands on the list (or the search box) as soon as it opens.
  useEffect(() => {
    if (!(searchable && autoFocusSearch)) listRef.current?.focus({ preventScroll: true });
  }, [searchable, autoFocusSearch]);
  useEffect(() => {
    document.getElementById(optId(active))?.scrollIntoView?.({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function move(from: number, step: number) {
    for (let i = from + step; i >= 0 && i < shown.length; i += step) {
      if (!shown[i]!.disabled) return setActive(i);
    }
  }

  function onKey(e: KeyboardEvent) {
    const nav: Record<string, () => void> = {
      ArrowDown: () => move(active, 1),
      ArrowUp: () => move(active, -1),
      Home: () => move(-1, 1),
      End: () => move(shown.length, -1),
    };
    if (nav[e.key]) {
      e.preventDefault();
      nav[e.key]!();
    } else if (e.key === 'Enter' || (e.key === ' ' && !searchable)) {
      e.preventDefault();
      const o = shown[active];
      if (o && !o.disabled) onPick(o.value);
    } else if (!searchable && e.key.length === 1 && /\S/.test(e.key)) {
      // Type-ahead: jump to the next option starting with that letter.
      const k = e.key.toLowerCase();
      const n = shown.length;
      for (let s = 1; s <= n; s++) {
        const i = (active + s) % n;
        if (!shown[i]!.disabled && shown[i]!.label.toLowerCase().startsWith(k)) return setActive(i);
      }
    }
  }

  return (
    <div className="flex min-h-0 flex-col" onKeyDown={onKey}>
      {searchable && (
        <div className={cn('border-b p-2', large && 'px-4 pb-3')}>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              autoFocus={autoFocusSearch}
              value={query}
              onChange={(e) => (setQuery(e.target.value), setActive(0))}
              placeholder="Search…"
              aria-label="Search options"
              aria-controls={id}
              aria-activedescendant={shown.length ? optId(active) : undefined}
              className="h-10 w-full rounded-lg bg-muted/60 pr-3 pl-9 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/30 md:text-sm"
            />
          </div>
        </div>
      )}
      <div
        ref={listRef}
        id={id}
        role="listbox"
        tabIndex={-1}
        aria-activedescendant={shown.length ? optId(active) : undefined}
        className={cn(
          'min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none',
          large ? 'px-2 py-1' : 'p-1',
        )}
      >
        {shown.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches</p>
        )}
        {shown.map((o, i) => {
          const header = o.group && o.group !== shown[i - 1]?.group ? o.group : null;
          const isSelected = o.value === value;
          return (
            <Fragment key={`${o.value}-${i}`}>
              {header && (
                <p className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {header}
                </p>
              )}
              <div
                id={optId(i)}
                role="option"
                data-value={o.value}
                aria-selected={isSelected}
                aria-disabled={o.disabled || undefined}
                onPointerMove={() => !o.disabled && active !== i && setActive(i)}
                onClick={() => !o.disabled && onPick(o.value)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg px-3 select-none',
                  large ? 'min-h-12 text-base' : 'min-h-9 text-sm',
                  i === active && 'bg-accent',
                  isSelected && 'font-semibold text-primary',
                  isPlaceholder(o) && !isSelected && 'text-muted-foreground',
                  o.disabled && 'cursor-not-allowed opacity-45',
                )}
              >
                <span className="min-w-0 flex-1 py-2 leading-snug">{o.label}</span>
                {isSelected && <Check aria-hidden className="size-4.5 shrink-0" />}
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
