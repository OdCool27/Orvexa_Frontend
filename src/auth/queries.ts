import { useQuery } from '@tanstack/react-query';
import { useAuth } from './Auth';

export function useSessionQuery<T>(path: string, enabled = true) {
  const { identity, sessionApi, transitioning } = useAuth();
  return useQuery<T>({
    queryKey: ['identity', identity?.id, identity?.activeMembershipId, path],
    queryFn: ({ signal }) => sessionApi<T>(path, 'GET', undefined, signal),
    enabled: !!identity && !transitioning && enabled,
  });
}
