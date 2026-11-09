import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { overlayOnStack } from '@/app/back-stack';
import { parentPath } from '@/app/go-back';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/overlays';

const overlayEntry = () => (window.history.state as Record<string, unknown> | null)?.__atqOverlay;

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Details</DialogTitle>
          <Button onClick={() => setOpen(false)}>Done</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

const popped = () =>
  new Promise<void>((r) => window.addEventListener('popstate', () => r(), { once: true }));

describe('back closes overlays', () => {
  it('closes the open dialog on back instead of leaving the screen', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const before = window.history.length;
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(window.history.length).toBe(before + 1);
    expect(overlayEntry()).toBeDefined();
    expect(overlayOnStack()).toBe(true);

    const pop = popped();
    act(() => window.history.back());
    await pop;
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(overlayOnStack()).toBe(false);
    expect(overlayEntry()).toBeUndefined();
  });

  it('removes its history entry when closed with a button', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByRole('dialog');
    const pop = popped();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await pop;
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(overlayOnStack()).toBe(false);
    expect(overlayEntry()).toBeUndefined();
  });
});

describe('parentPath', () => {
  it('goes up to the list of a detail screen', () => {
    expect(parentPath('/students/abc')).toBe('/students');
    expect(parentPath('/feedback/s1/2026-03-09')).toBe('/feedback');
    expect(parentPath('/')).toBe('/');
  });
});
