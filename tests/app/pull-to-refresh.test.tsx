import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { PullToRefresh } from '@/app/pull-to-refresh';

function setup() {
  const qc = new QueryClient();
  const refetch = jest.spyOn(qc, 'refetchQueries').mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={qc}>
      <PullToRefresh />
      <p>content</p>
    </QueryClientProvider>,
  );
  return refetch;
}

const touch = (y: number, x = 10) => ({ touches: [{ clientX: x, clientY: y }] });

describe('PullToRefresh', () => {
  it('refetches active queries after a long enough pull from the top', async () => {
    const refetch = setup();
    fireEvent.touchStart(window, touch(100));
    fireEvent.touchMove(window, touch(180));
    expect(screen.getByRole('status')).toHaveTextContent('Pull to refresh');
    fireEvent.touchMove(window, touch(300));
    await act(async () => {
      fireEvent.touchEnd(window);
    });
    expect(refetch).toHaveBeenCalledWith({ type: 'active' });
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing');
  });

  it('ignores short pulls, sideways swipes and gestures while a sheet is open', () => {
    const refetch = setup();
    // Short pull.
    fireEvent.touchStart(window, touch(100));
    fireEvent.touchMove(window, touch(130));
    fireEvent.touchEnd(window);
    // Mostly horizontal swipe.
    fireEvent.touchStart(window, touch(100, 10));
    fireEvent.touchMove(window, touch(150, 200));
    fireEvent.touchEnd(window);
    // Dialog open.
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    fireEvent.touchStart(window, touch(100));
    fireEvent.touchMove(window, touch(400));
    fireEvent.touchEnd(window);
    dialog.remove();
    expect(refetch).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
