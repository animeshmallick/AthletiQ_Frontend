import {
  __resetOutbox,
  flushOutbox,
  pendingCount,
  pendingMarks,
  queueMarks,
  startAttendanceSync,
} from '@/lib/attendance-outbox';
import { tokenStore } from '@/lib/api';
import { adminUser, coachUser, mockApi } from '../utils';

describe('attendance without signal', () => {
  beforeEach(() => __resetOutbox());

  it('keeps marks on the phone, latest tap per student, across sessions', () => {
    queueMarks('b1', '2026-03-09', [{ studentId: 's1', status: 'present' }]);
    queueMarks('b1', '2026-03-09', [
      { studentId: 's1', status: 'absent' },
      { studentId: 's2', status: 'late' },
    ]);
    queueMarks('b2', '2026-03-09', [{ studentId: 's9', status: 'present' }]);
    expect(pendingCount('b1', '2026-03-09')).toBe(2);
    expect(pendingCount()).toBe(3);
    expect(pendingMarks('b1', '2026-03-09')).toEqual([
      { studentId: 's1', status: 'absent' },
      { studentId: 's2', status: 'late' },
    ]);
    // Survives a reload (kept in storage).
    expect(
      JSON.parse(localStorage.getItem('atq-attendance-outbox')!)['b1:2026-03-09'],
    ).toBeTruthy();
  });

  it('syncs when the connection is back and tells the app what was saved', async () => {
    const api = mockApi({ 'PUT /attendance/session': () => ({ saved: 2 }) });
    const onSynced = jest.fn();
    const onRejected = jest.fn();
    startAttendanceSync({ onSynced, onRejected });
    queueMarks('b1', '2026-03-09', [
      { studentId: 's1', status: 'absent' },
      { studentId: 's2', status: 'late' },
    ]);
    await flushOutbox();
    expect(api.find('PUT /attendance/session')[0]!.body).toEqual({
      batchId: 'b1',
      date: '2026-03-09',
      records: [
        { studentId: 's1', status: 'absent' },
        { studentId: 's2', status: 'late' },
      ],
    });
    expect(pendingCount()).toBe(0);
    expect(onSynced).toHaveBeenCalledWith({
      synced: [{ batchId: 'b1', date: '2026-03-09', n: 2 }],
    });
    expect(onRejected).not.toHaveBeenCalled();
  });

  it('keeps waiting while still offline, and drops (with the reason) what the server refuses', async () => {
    const onSynced = jest.fn();
    const onRejected = jest.fn();
    startAttendanceSync({ onSynced, onRejected });
    global.fetch = jest.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as never;
    queueMarks('b1', '2026-03-09', [{ studentId: 's1', status: 'present' }]);
    await flushOutbox();
    expect(pendingCount()).toBe(1);
    expect(onSynced).not.toHaveBeenCalled();

    mockApi({
      'PUT /attendance/session': () => ({
        status: 422,
        body: { error: { code: 'UNPROCESSABLE', message: 'This day is locked' } },
      }),
    });
    await flushOutbox();
    expect(pendingCount()).toBe(0);
    expect(onRejected).toHaveBeenCalledWith('b1', '2026-03-09', 'This day is locked');
  });

  it('keeps marks while signed out, and never sends them as someone else', async () => {
    const as = (user: typeof coachUser) =>
      tokenStore.set({ accessToken: 't', accessTokenExpiresIn: 900, user });
    let status = 401;
    const api = mockApi({
      'PUT /attendance/session': () =>
        status === 200
          ? { saved: 1 }
          : { status, body: { error: { code: 'UNAUTHENTICATED', message: 'Signed out' } } },
      'POST /auth/refresh': () => ({ status: 500, body: { error: { code: 'X', message: 'x' } } }),
    });
    const onRejected = jest.fn();
    startAttendanceSync({ onSynced: jest.fn(), onRejected });
    as(coachUser);
    queueMarks('b1', '2026-03-09', [{ studentId: 's1', status: 'present' }]);
    await flushOutbox();
    expect(onRejected).not.toHaveBeenCalled();
    expect(pendingCount()).toBe(1);
    // Someone else signs in on this phone: not theirs to send.
    status = 200;
    const before = api.find('PUT /attendance/session').length;
    as(adminUser);
    await flushOutbox();
    expect(pendingCount()).toBe(0);
    expect(api.find('PUT /attendance/session')).toHaveLength(before);
    // Back again: sent on sign-in.
    as(coachUser);
    await flushOutbox();
    expect(api.find('PUT /attendance/session').length).toBeGreaterThan(before);
    expect(pendingCount()).toBe(0);
    tokenStore.set(null);
  });
});
