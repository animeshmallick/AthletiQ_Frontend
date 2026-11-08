import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { WeekdayPicker } from '@/components/ui/controls';
import { daysForBatch, sameDays } from '@/lib/forms';

describe('daysForBatch', () => {
  it('keeps the student’s days the new batch also runs', () => {
    expect(daysForBatch([1, 3, 5, 6], [5, 1, 2])).toEqual([1, 5]);
  });

  it('falls back to the batch’s own days (at most 6) when none fit', () => {
    expect(daysForBatch([2, 4, 6], [1, 3, 5])).toEqual([2, 4, 6]);
    expect(daysForBatch([6, 2, 4])).toEqual([2, 4, 6]);
    expect(daysForBatch([1, 2, 3, 4, 5, 6, 7])).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('compares day lists', () => {
    expect(sameDays([1, 2], [1, 2])).toBe(true);
    expect(sameDays([1, 2], [2, 1])).toBe(false);
    expect(sameDays(undefined, [])).toBe(true);
  });
});

describe('WeekdayPicker', () => {
  function Harness({ start, allowed }: { start: number[]; allowed: number[] }) {
    const [days, setDays] = useState(start);
    return (
      <>
        <WeekdayPicker value={days} onChange={setDays} allowed={allowed} />
        <output>{days.join(',')}</output>
      </>
    );
  }

  it('lets a selected day the batch doesn’t run be removed instead of getting stuck', async () => {
    const user = userEvent.setup();
    render(<Harness start={[1, 2]} allowed={[2, 4]} />);
    const monday = screen.getByRole('button', { name: /Monday \(batch doesn't run/ });
    expect(monday).toBeEnabled();
    expect(monday).toHaveAttribute('data-outside');
    await user.click(monday);
    expect(screen.getByText('2')).toBeInTheDocument();
    // Unselected days outside the batch can't be picked.
    expect(screen.getByRole('button', { name: 'Wednesday' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Thursday' })).toBeEnabled();
  });
});
