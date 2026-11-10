import { fireEvent, render, screen } from '@testing-library/react';
import { SlideToConfirm } from '@/components/slide-to-confirm';

// jsdom has no PointerEvent: a mouse event with a pointer id is enough here.
if (!('PointerEvent' in window)) {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  (window as unknown as { PointerEvent: typeof PointerEventPolyfill }).PointerEvent =
    PointerEventPolyfill;
}

describe('SlideToConfirm', () => {
  // The track is 300px wide: the handle (48px + 2×4px padding) can travel 244px.
  let width: PropertyDescriptor | undefined;
  beforeAll(() => {
    width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 300,
    });
  });
  afterAll(() => {
    if (width) Object.defineProperty(HTMLElement.prototype, 'clientWidth', width);
  });

  const drag = (to: number) => {
    const knob = screen.getByRole('slider');
    fireEvent.pointerDown(knob, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(knob, { clientX: to, pointerId: 1 });
    fireEvent.pointerUp(knob, { clientX: to, pointerId: 1 });
    return knob;
  };

  it('springs back when let go before the end', () => {
    const onConfirm = jest.fn();
    render(<SlideToConfirm label="Slide to switch" onConfirm={onConfirm} />);
    const knob = drag(150);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(knob).toHaveAttribute('aria-valuenow', '0');
  });

  it('confirms when slid to the end and let go', () => {
    const onConfirm = jest.fn();
    render(<SlideToConfirm label="Slide to switch" onConfirm={onConfirm} />);
    const knob = drag(244);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(knob).toHaveAttribute('aria-valuetext', 'Confirmed');
    // Only once.
    fireEvent.keyDown(knob, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('confirms from the keyboard', () => {
    const onConfirm = jest.fn();
    render(<SlideToConfirm label="Slide to switch" onConfirm={onConfirm} />);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Slide to switch' }), { key: ' ' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
