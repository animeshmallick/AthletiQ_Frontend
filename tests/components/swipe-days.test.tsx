import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SwipeDays } from '@/components/swipe-days';

function setup() {
  const onStep = jest.fn();
  render(
    <SwipeDays
      dayKey="2026-03-10"
      direction={0}
      onStep={onStep}
      prevLabel="Yesterday"
      nextLabel="Tomorrow"
    >
      <p>Day content</p>
    </SwipeDays>,
  );
  const area = screen.getByText('Day content').closest('[data-slot="swipe-days"]')!;
  const swipe = (points: [number, number][]) => {
    const [first, ...rest] = points;
    fireEvent.touchStart(area, { touches: [{ clientX: first![0], clientY: first![1] }] });
    for (const [x, y] of rest) fireEvent.touchMove(area, { touches: [{ clientX: x, clientY: y }] });
    fireEvent.touchEnd(area, { touches: [] });
  };
  return { onStep, swipe };
}

describe('SwipeDays', () => {
  it('moves to the next day after a long swipe left, and back after a swipe right', async () => {
    const { onStep, swipe } = setup();
    swipe([
      [300, 100],
      [280, 102],
      [200, 104],
      [150, 105],
    ]);
    await waitFor(() => expect(onStep).toHaveBeenCalledWith(1));
    swipe([
      [100, 100],
      [120, 100],
      [200, 100],
      [260, 100],
    ]);
    await waitFor(() => expect(onStep).toHaveBeenLastCalledWith(-1));
  });

  it('springs back on a short swipe and ignores vertical scrolling', async () => {
    const { onStep, swipe } = setup();
    swipe([
      [300, 100],
      [290, 100],
      [280, 100],
    ]);
    swipe([
      [200, 100],
      [205, 160],
      [150, 300],
    ]);
    await new Promise((r) => setTimeout(r, 500));
    expect(onStep).not.toHaveBeenCalled();
  });
});
