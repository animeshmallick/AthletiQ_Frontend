import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { shareFile } from '@/app/share-file';
import { ReportDialog, slug, STUDENT_REPORT_INCLUDES } from '@/components/report-dialog';
import { mockApi } from '../utils';

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <ReportDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) onClose?.();
      }}
      title="Riya Sharma - report"
      description="A detailed PDF."
      options={[
        { value: 'all', label: 'All batches (consolidated)', hint: 'Since joining' },
        { value: 'b1', label: 'Morning U-12', hint: 'Since 05 Jan 2026' },
      ]}
      path={(v) => `/reports/students/s1/pdf?batchId=${v}`}
      filename={(v) => `riya-${v}.pdf`}
      includes={STUDENT_REPORT_INCLUDES}
    />
  );
}

describe('ReportDialog', () => {
  it('downloads the chosen scope', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      'GET /reports/students/s1/pdf': () => ({ status: 200, body: { pdf: true } }),
    });
    const onClose = jest.fn();
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<Harness onClose={onClose} />);
    expect(screen.getByText('Skills progress')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Morning U-12/ }));
    await user.click(screen.getByRole('button', { name: /Download/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.calls[0]!.query.get('batchId')).toBe('b1');
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it('shows the error when the report cannot be built', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /reports/students/s1/pdf': () => ({
        status: 422,
        body: { error: { code: 'UNPROCESSABLE', message: 'Nothing to report' } },
      }),
    });
    const onClose = jest.fn();
    render(<Harness onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /Share/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Share/ })).not.toBeDisabled());
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('shareFile', () => {
  const blob = new Blob(['%PDF-'], { type: 'application/pdf' });

  it('uses the share sheet when the browser can share files', async () => {
    const share = jest.fn(async () => undefined);
    Object.assign(navigator, { canShare: () => true, share });
    await expect(shareFile(blob, 'r.pdf', 'Report')).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Report', files: [expect.any(File)] }),
    );
    share.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'AbortError' }));
    await expect(shareFile(blob, 'r.pdf', 'Report')).resolves.toBe('cancelled');
    // A last-moment refusal falls back to a download.
    share.mockRejectedValueOnce(new Error('NotAllowed'));
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await expect(shareFile(blob, 'r.pdf', 'Report')).resolves.toBe('downloaded');
    click.mockRestore();
    Object.assign(navigator, { canShare: undefined, share: undefined });
  });

  it('makes file-name slugs', () => {
    expect(slug('Riya  Sharma!')).toBe('riya-sharma');
    expect(slug('***')).toBe('report');
  });
});
