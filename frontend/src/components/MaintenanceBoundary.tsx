import { useEffect, useRef, type ReactNode } from 'react';
import { Alert, Anchor, Button, Container, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { activeMemberships } from '../vendor/workspace';
import BrandMark from './BrandMark';

type Status = { enabled: boolean; forceScreen: boolean; message: string };
async function readStatus(signal: AbortSignal): Promise<Status> {
  const value = await apiRequest<unknown>('/public/maintenance', { signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]), skipAuthRefresh: true });
  if (!value || typeof value !== 'object' || !('enabled' in value) || typeof value.enabled !== 'boolean'
    || !('forceScreen' in value) || typeof value.forceScreen !== 'boolean' || (value.forceScreen && !value.enabled)
    || !('message' in value) || typeof value.message !== 'string' || !value.message.trim() || value.message.length > 500) {
    throw new Error('The maintenance status could not be verified. Please try again.');
  }
  return { enabled: value.enabled, forceScreen: value.forceScreen, message: value.message };
}
function continuationPath(path: string) {
  return path === '/login' || path === '/oauth/callback' || path === '/payment/return'
    || path === '/account/security' || path === '/account/tickets' || path === '/account/bookings'
    || /^\/account\/bookings\/[^/]+$/.test(path)
    || /^\/(ticket|monitor|t|queue-board)\//.test(path)
    || /^\/vendors\/[^/]+\/bookings\/[^/]+$/.test(path);
}

export default function MaintenanceBoundary({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { pathname, search } = useLocation();
  const status = useQuery({
    queryKey: ['public-maintenance'],
    queryFn: ({ signal }) => readStatus(signal),
    staleTime: 0, refetchInterval: 15_000, refetchOnWindowFocus: true, retry: 1,
  });
  const staffPath = pathname.startsWith('/dashboard') && activeMemberships(user?.tenants || []).length > 0;
  // This only keeps the return UI reachable. The backend independently verifies
  // the stored paid payment and OTP; query parameters never authorize intake.
  const bookingPaymentReturn = /^\/vendors\/[^/]+\/book(?:\/[^/]+)?$/.test(pathname) && /^\d+$/.test(new URLSearchParams(search).get('booking_sms_payment') || '');
  const exempt = continuationPath(pathname) || bookingPaymentReturn || staffPath || user?.roles.includes('platform_admin');
  const forced = status.data?.enabled && status.data.forceScreen && !exempt;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!forced) return;
    const previousTitle = document.title;
    document.title = 'Maintenance | GetPrio';
    heading.current?.focus();
    return () => { document.title = previousTitle; };
  }, [forced]);
  if (!exempt && status.isPending) return <Container className="maintenance-page" size="sm"><Stack align="center"><Loader aria-label="Checking service availability" /><Text>Checking service availability…</Text></Stack></Container>;
  if (forced) return <Container className="maintenance-page" size="sm">
    <Paper p="xl" radius="xl" withBorder><Stack gap="lg">
      <BrandMark />
      <Title ref={heading} tabIndex={-1} order={1}>GetPrio is undergoing maintenance</Title>
      <Text>{status.data?.message}</Text>
      <Text c="dimmed">New bookings and queue joins are temporarily paused. Existing tickets, bookings, and vendor services remain available.</Text>
      {status.isError ? <Alert color="red" title="Could not check the latest status">Please try again. Your existing tickets and bookings are unchanged.</Alert> : null}
      <Button mih={44} loading={status.isFetching} onClick={() => void status.refetch()}>Check again</Button>
      <Group gap="md" wrap="wrap"><Anchor component={Link} to="/login">Staff / admin sign in</Anchor><Anchor component={Link} to="/account/tickets">My existing tickets</Anchor><Anchor component={Link} to="/account/bookings">My existing bookings</Anchor></Group>
      <Text size="sm" c="dimmed">This page checks automatically and will return to your original page when maintenance ends.</Text>
    </Stack></Paper>
  </Container>;
  return <>
    {status.data?.enabled ? <Alert className="maintenance-notice" color="yellow" title="New bookings and queue joins are paused">{status.data.message} Existing services can continue.</Alert> : null}
    {children}
  </>;
}
