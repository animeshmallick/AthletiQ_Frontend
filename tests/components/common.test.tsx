import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import {
  AttendanceBadge,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  InvoiceStatusBadge,
  MoneyInput,
  Pagination,
  Progress,
  SearchInput,
  StatCard,
} from '@/components/common';
import { Button } from '@/components/ui/button';
import { Segmented, WeekdayPicker } from '@/components/ui/controls';
import { DateStepper } from '@/components/pickers';
import { ApiError } from '@/lib/api';
import { addDays, today } from '@/lib/format';

describe('Button', () => {
  it('shows a spinner and disables itself while loading', () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });

  it('renders as its child with asChild', () => {
    render(
      <Button asChild>
        <a href="/x">Go</a>
      </Button>,
    );
    expect(screen.getByRole('link', { name: 'Go' })).toHaveAttribute('href', '/x');
  });
});

describe('icon buttons', () => {
  it('show their name as a hover tooltip', () => {
    render(
      <Button size="icon" aria-label="Next day">
        &gt;
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Next day' })).toHaveAttribute('title', 'Next day');
  });
});

describe('DateStepper', () => {
  function Harness({ start }: { start: string }) {
    const [d, setD] = useState(start);
    return <DateStepper value={d} onChange={setD} max={today()} />;
  }

  it('offers a one-tap jump back to today', async () => {
    const user = userEvent.setup();
    render(<Harness start={addDays(today(), -3)} />);
    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByLabelText('Date')).toHaveValue(today());
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();
  });
});

describe('feedback states', () => {
  it('renders empty and error states with actions', async () => {
    const retry = jest.fn();
    render(
      <>
        <EmptyState
          title="Nothing here"
          description="Add something"
          action={<button>Add</button>}
        />
        <ErrorState error={new ApiError(500, 'INTERNAL', 'Server exploded')} onRetry={retry} />
      </>,
    );
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Server exploded');
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(retry).toHaveBeenCalled();
  });

  it('renders stat cards, progress and badges', () => {
    render(
      <>
        <StatCard label="Collected" value="₹2,500" hint="3 payments" />
        <StatCard label="Loading" value="x" loading />
        <Progress value={150} />
        <InvoiceStatusBadge status="overdue" />
        <AttendanceBadge status={null} />
        <AttendanceBadge status="late" />
      </>,
    );
    expect(screen.getByText('₹2,500')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '150');
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Not marked')).toBeInTheDocument();
    expect(screen.getByText('Late')).toBeInTheDocument();
  });

  it('shows field errors instead of hints', () => {
    const { rerender } = render(
      <Field label="Phone" hint="Mobile number" required>
        <input />
      </Field>,
    );
    expect(screen.getByText('Mobile number')).toBeInTheDocument();
    rerender(
      <Field label="Phone" hint="Mobile number" error="Invalid">
        <input />
      </Field>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid');
    expect(screen.queryByText('Mobile number')).not.toBeInTheDocument();
  });
});

describe('ConfirmDialog', () => {
  it('requires a reason before confirming', async () => {
    const onConfirm = jest.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={() => undefined}
        title="Refund?"
        requireReason
        confirmLabel="Refund"
        destructive
        onConfirm={onConfirm}
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Refund' });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/reason/i), 'Family moved');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith('Family moved');
  });

  it('cancels', async () => {
    const onOpenChange = jest.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Delete?"
        onConfirm={() => undefined}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('inputs', () => {
  it('MoneyInput converts rupees to paise', () => {
    const onChange = jest.fn();
    render(<MoneyInput value={250000} onChange={onChange} aria-label="Fee" />);
    const input = screen.getByLabelText('Fee');
    expect(input).toHaveValue('2500');
    fireEvent.change(input, { target: { value: '3,000.50' } });
    expect(onChange).toHaveBeenLastCalledWith(300050);
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('SearchInput debounces and can be cleared', () => {
    jest.useFakeTimers();
    const onChange = jest.fn();
    render(<SearchInput value="" onChange={onChange} placeholder="Search…" />);
    fireEvent.change(screen.getByLabelText('Search…'), { target: { value: 'ravi' } });
    expect(onChange).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(300));
    expect(onChange).toHaveBeenCalledWith('ravi');
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('WeekdayPicker toggles days and respects allowed days', async () => {
    function Harness() {
      const [days, setDays] = useState<number[]>([1]);
      return (
        <>
          <WeekdayPicker value={days} onChange={setDays} allowed={[1, 3, 5]} />
          <output role="status">{days.join(',')}</output>
        </>
      );
    }
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Tuesday' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Friday' }));
    await userEvent.click(screen.getByRole('button', { name: 'Wednesday' }));
    expect(screen.getByRole('status')).toHaveTextContent('1,3,5');
    await userEvent.click(screen.getByRole('button', { name: 'Monday' }));
    expect(screen.getByRole('status')).toHaveTextContent('3,5');
    expect(screen.getByRole('button', { name: 'Wednesday' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('Segmented control switches value', async () => {
    const onChange = jest.fn();
    render(
      <Segmented
        ariaLabel="Status"
        value="a"
        onChange={onChange}
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'B' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('Pagination', () => {
  it('pages forward and back and hides for a single page', async () => {
    const onPage = jest.fn();
    const { rerender, container } = render(
      <Pagination page={2} totalPages={3} total={60} onPage={onPage} />,
    );
    expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    await userEvent.click(screen.getByRole('button', { name: /previous/i }));
    expect(onPage.mock.calls).toEqual([[3], [1]]);
    rerender(<Pagination page={1} totalPages={1} total={5} onPage={onPage} />);
    expect(container).toBeEmptyDOMElement();
  });
});
