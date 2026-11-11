/**
 * One open at a time: rows inside an <ExpandGroup> share which one is expanded, so opening a row
 * closes the one that was open (the same rule as the accordions). Outside a group a row keeps its
 * own state.
 */
import { createContext, useContext, useState, type ReactNode } from 'react';

type Group = { open: string | null; setOpen: (id: string | null) => void };
const Ctx = createContext<Group | null>(null);

export function ExpandGroup({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  return <Ctx.Provider value={{ open, setOpen }}>{children}</Ctx.Provider>;
}

/** [is this row open, toggle it]. */
export function useExpand(id: string): [boolean, () => void] {
  const group = useContext(Ctx);
  const [own, setOwn] = useState(false);
  if (!group) return [own, () => setOwn((o) => !o)];
  const open = group.open === id;
  return [open, () => group.setOpen(open ? null : id)];
}
