import { act } from '@testing-library/react';
import { InboxList, PushBanner, showIncomingPush } from '@/app/inbox';
import { coachUser, mockApi, renderPage, screen, waitFor } from '../utils';

const now = new Date().toISOString();
const inbox = {
  unread: 1,
  items: [
    {
      id: 'n1',
      category: 'sessions',
      title: '⏰ TT Grade 5 starts at 5:30 pm',
      body: 'In 30 min at Namma Smash. Check in when you arrive.',
      link: '/',
      readAt: null,
      createdAt: now,
    },
    {
      id: 'n2',
      category: 'money',
      title: '💰 Fee received · ₹3,000',
      body: 'Aarav · UPI · received by Shubham',
      link: '/finance',
      readAt: now,
      createdAt: now,
    },
  ],
};

describe('notification inbox', () => {
  it('lists notifications, marks one read when opened and all read on request', async () => {
    const api = mockApi({
      'GET /me/notifications': () => inbox,
      'POST /me/notifications/read': () => ({ unread: 0, items: [] }),
    });
    const onNavigate = jest.fn();
    const { user, router } = await renderPage(<InboxList onNavigate={onNavigate} />, {
      path: '/x',
      route: '/x',
      user: coachUser,
      extraRoutes: [{ path: '/', element: <div>Home screen</div> }],
    });
    expect(await screen.findByText('⏰ TT Grade 5 starts at 5:30 pm')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Mark all read/ }));
    await waitFor(() => expect(api.find('POST /me/notifications/read')).toHaveLength(1));
    expect(api.find('POST /me/notifications/read')[0]!.body).toEqual({});

    await user.click(screen.getByRole('button', { name: /Fee received/ }));
    expect(onNavigate).toHaveBeenCalled();
    await waitFor(() => expect(router.state.location.pathname).toBe('/finance'));
  });

  it('shows a banner when a notification arrives while the app is open', async () => {
    const api = mockApi({ 'POST /me/notifications/read': () => ({ unread: 0, items: [] }) });
    const { user, router } = await renderPage(<PushBanner />, {
      path: '/x',
      route: '/x',
      user: coachUser,
      extraRoutes: [{ path: '/registrations', element: <div>Sign-ups</div> }],
    });
    // Once the app has started (the banner is listening), a notification arrives.
    await waitFor(() => {
      act(() =>
        showIncomingPush({
          title: '🙋 New student sign-up',
          body: 'Diya wants to join.',
          link: '/registrations',
          notificationId: 'n9',
        }),
      );
      expect(screen.getByText('🙋 New student sign-up')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/registrations'));
    await waitFor(() =>
      expect(api.find('POST /me/notifications/read')[0]!.body).toEqual({ ids: ['n9'] }),
    );
  });
});
