import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Select } from '@/components/ui/select';

function Controlled({ onChange }: { onChange?: (v: string) => void }) {
  const [v, setV] = useState('');
  return (
    <>
      <label htmlFor="fruit">Fruit</label>
      <Select
        id="fruit"
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          onChange?.(e.target.value);
        }}
      >
        <option value="">Select a fruit…</option>
        <option value="apple">Apple</option>
        <option value="banana">Banana</option>
        <option value="cherry" disabled>
          Cherry
        </option>
      </Select>
      <output>{v || 'none'}</output>
    </>
  );
}

describe('Select', () => {
  it('opens a listbox and picks an option with the mouse', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<Controlled onChange={onChange} />);
    const trigger = screen.getByRole('combobox', { name: 'Fruit' });
    expect(trigger).toHaveTextContent('Select a fruit…');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('option', { name: 'Banana' }));
    expect(onChange).toHaveBeenCalledWith('banana');
    expect(screen.getByText('banana')).toBeInTheDocument();
    expect(trigger).toHaveTextContent('Banana');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('supports the keyboard and skips disabled options', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    screen.getByRole('combobox', { name: 'Fruit' }).focus();
    await user.keyboard('{ArrowDown}');
    const list = await screen.findByRole('listbox');
    await waitFor(() => expect(list).toHaveFocus());
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');
    // Cherry is disabled, so the last reachable option is Banana.
    expect(screen.getByText('banana')).toBeInTheDocument();
    // Type-ahead jumps to the first option starting with the letter.
    const trigger = screen.getByRole('combobox', { name: 'Fruit' });
    await waitFor(() => expect(trigger).toHaveFocus());
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    await user.keyboard('{ArrowDown}');
    const reopened = await screen.findByRole('listbox');
    await waitFor(() => expect(reopened).toHaveFocus());
    await user.keyboard('a{Enter}');
    expect(screen.getByText('apple')).toBeInTheDocument();
  });

  it('ignores clicks on disabled options', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.click(screen.getByRole('combobox', { name: 'Fruit' }));
    await user.click(screen.getByRole('option', { name: 'Cherry' }));
    expect(screen.getByText('none')).toBeInTheDocument();
  });

  it('adds a search box for long lists', async () => {
    const user = userEvent.setup();
    const names = [
      'Ahmedabad',
      'Bengaluru',
      'Chennai',
      'Delhi',
      'Hyderabad',
      'Jaipur',
      'Kolkata',
      'Mumbai',
      'Pune',
    ];
    render(
      <Select aria-label="City" defaultValue="Delhi">
        <optgroup label="Cities">
          {names.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </optgroup>
      </Select>,
    );
    await user.click(screen.getByRole('combobox', { name: 'City' }));
    expect(screen.getByText('Cities')).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Search options' }), 'pun');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Pune']);
    await user.keyboard('{Enter}');
    expect(screen.getByRole('combobox', { name: 'City' })).toHaveTextContent('Pune');
    await user.click(screen.getByRole('combobox', { name: 'City' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search options' }), 'zzz');
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });

  it('works with react-hook-form register() and follows reset()', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    function Form() {
      const form = useForm({ defaultValues: { level: 'beginner' } });
      return (
        <form onSubmit={form.handleSubmit((v) => onSubmit(v))}>
          <Select aria-label="Level" {...form.register('level')}>
            <option value="beginner">Beginner</option>
            <option value="advanced">Advanced</option>
          </Select>
          <button type="button" onClick={() => form.reset({ level: 'beginner' })}>
            Reset
          </button>
          <button type="submit">Save</button>
        </form>
      );
    }
    render(<Form />);
    const trigger = screen.getByRole('combobox', { name: 'Level' });
    expect(trigger).toHaveTextContent('Beginner');
    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: 'Advanced' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ level: 'advanced' }));
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(trigger).toHaveTextContent('Beginner'));
  });

  it('uses a bottom sheet titled with the label on phones', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      ...original(q),
      matches: true,
    })) as typeof window.matchMedia;
    try {
      const user = userEvent.setup();
      render(<Controlled />);
      await user.click(screen.getByRole('combobox', { name: 'Fruit' }));
      const sheet = await screen.findByRole('dialog', { name: 'Fruit' });
      expect(sheet).toBeInTheDocument();
      await user.click(screen.getByRole('option', { name: 'Apple' }));
      expect(screen.getByText('apple')).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    } finally {
      window.matchMedia = original;
    }
  });
});
