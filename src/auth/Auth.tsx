import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, request } from '../api/client';
import {
  identityApi,
  workspaceIdentity,
  type IdentitySnapshot,
  type SessionGrant,
} from '../api/identity';
import type { Identity } from '../api/types';

type RotationPath =
  | '/api/v1/auth/business'
  | '/api/v1/auth/mfa/confirm'
  | '/api/v1/auth/mfa/verify'
  | '/api/v1/auth/mfa/recover'
  | '/api/v1/auth/mfa/disable';
interface AuthValue {
  user: Identity | null;
  identity: IdentitySnapshot | null;
  notice: string;
  transitioning: boolean;
  recoveryCodes: string[];
  acknowledgeRecovery: () => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  requireSignIn: (message: string) => void;
  rotate: (path: RotationPath, body: unknown) => Promise<void>;
  sessionApi: <T>(
    path: string,
    method?: string,
    body?: unknown,
    signal?: AbortSignal,
  ) => Promise<T>;
  api: <T>(
    path: string,
    method?: string,
    body?: unknown,
    download?: boolean,
    signal?: AbortSignal,
  ) => Promise<T>;
}
interface Session {
  grant: SessionGrant;
  identity: IdentitySnapshot;
}
const Context = createContext<AuthValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const codes = useRef<string[]>([]);
  const current = useRef<Session | null>(null);
  const generation = useRef(0);
  const cache = useQueryClient();
  function clearCache() {
    void cache.cancelQueries();
    cache.clear();
  }
  function clear() {
    generation.current++;
    current.current = null;
    codes.current = [];
    setSession(null);
    setRecoveryCodes([]);
    setTransitioning(false);
    clearCache();
  }
  function requireSignIn(message: string) {
    clear();
    setNotice(message);
  }
  function logout() {
    const token = current.current?.grant.accessToken;
    clear();
    const attempt = generation.current;
    setNotice('');
    if (token)
      void identityApi.logout(token).catch(() => {
        if (attempt === generation.current)
          setNotice(
            'Signed out on this device. Server revocation could not be confirmed; the server session will expire automatically.',
          );
      });
  }
  async function install(grant: SessionGrant, attempt: number) {
    if (
      grant.tokenType !== 'Bearer' ||
      !grant.accessToken ||
      !Number.isFinite(Date.parse(grant.expiresAt))
    )
      throw new ApiError('The server returned an unsupported session response.', 502);
    const identity = await identityApi.me(grant.accessToken);
    if (attempt !== generation.current) {
      void identityApi.logout(grant.accessToken).catch(() => {});
      return;
    }
    const { recoveryCodes: issuedCodes, ...sessionGrant } = grant;
    const next = { grant: sessionGrant, identity };
    current.current = next;
    codes.current = issuedCodes || [];
    setRecoveryCodes(codes.current);
    setSession(next);
    setTransitioning(false);
  }
  async function login(email: string, password: string) {
    clear();
    setNotice('');
    const attempt = generation.current;
    const grant = await identityApi.login(email, password);
    try {
      await install(grant, attempt);
    } catch (error) {
      void identityApi.logout(grant.accessToken).catch(() => {});
      throw error;
    }
  }
  async function rotate(path: RotationPath, body: unknown) {
    const active = current.current;
    if (!active) throw new ApiError('Sign in again before continuing.', 401);
    const attempt = ++generation.current;
    // Hide the old workspace before a token-rotating command. The old token may be revoked even if its response is lost.
    current.current = null;
    setTransitioning(true);
    setNotice('');
    clearCache();
    let received = false;
    let issuedCodes: string[] = [];
    try {
      const grant = await request<SessionGrant>(path, {
        method: 'POST',
        body,
        authorization: `Bearer ${active.grant.accessToken}`,
      });
      received = true;
      issuedCodes = grant.recoveryCodes || [];
      await install(grant, attempt);
    } catch (error) {
      if (attempt !== generation.current) throw error;
      if (!received && error instanceof ApiError && error.status >= 400 && error.status < 500) {
        current.current = active;
        setSession(active);
        setTransitioning(false);
        setNotice(error.message);
      } else {
        requireSignIn(
          'The session change could not be confirmed. Sign in again to reconcile your account before continuing.',
        );
        // Recovery codes are issued only once. Preserve them for acknowledgement even if loading the new profile failed.
        if (issuedCodes.length) {
          codes.current = issuedCodes;
          setRecoveryCodes(issuedCodes);
        }
      }
      throw error;
    }
  }
  function acknowledgeRecovery() {
    codes.current = [];
    setRecoveryCodes([]);
  }
  useEffect(() => {
    if (!session || transitioning) return;
    const timer = setTimeout(
      () => requireSignIn('Your session expired. Please sign in again.'),
      Math.min(Math.max(0, Date.parse(session.grant.expiresAt) - Date.now()), 2147483647),
    );
    return () => clearTimeout(timer);
  }, [session, transitioning]);
  async function send<T>(
    path: string,
    method: string,
    body: unknown,
    download: boolean,
    signal?: AbortSignal,
    tenant = false,
  ): Promise<T> {
    const active = current.current;
    if (!active || (tenant && (!workspaceIdentity(active.identity) || codes.current.length)))
      throw new ApiError(
        'Complete sign-in and select a business before accessing this workspace.',
        403,
      );
    try {
      const result = await request<T>(path, {
        method,
        body,
        download,
        signal,
        authorization: `Bearer ${active.grant.accessToken}`,
      });
      if (active !== current.current)
        throw new DOMException('The business or session changed.', 'AbortError');
      return result;
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 401 &&
        current.current === active &&
        !path.includes('/mfa/') &&
        path !== '/api/v1/invitations/accept'
      )
        requireSignIn('Your session expired or was revoked. Please sign in again.');
      throw error;
    }
  }
  function api<T>(
    path: string,
    method = 'GET',
    body?: unknown,
    download = false,
    signal?: AbortSignal,
  ) {
    return send<T>(path, method, body, download, signal, true);
  }
  function sessionApi<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal) {
    if (
      !path.startsWith('/api/v1/auth/') &&
      !['/api/v1/memberships', '/api/v1/businesses', '/api/v1/invitations/accept'].includes(path)
    )
      return Promise.reject(
        new ApiError('This endpoint requires an active business workspace.', 403),
      );
    return send<T>(path, method, body, false, signal);
  }
  return (
    <Context.Provider
      value={{
        user:
          session && !transitioning && !recoveryCodes.length
            ? workspaceIdentity(session.identity)
            : null,
        identity: session?.identity || null,
        notice,
        transitioning,
        recoveryCodes,
        acknowledgeRecovery,
        login,
        logout,
        requireSignIn,
        rotate,
        sessionApi,
        api,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  return useContext(Context)!;
}
