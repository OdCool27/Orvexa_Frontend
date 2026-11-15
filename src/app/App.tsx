import { BatchesPage } from '../features/inventory-operations';
import { lazy, Suspense, useState, type ReactNode } from 'react';
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
  useLocation,
  useOutletContext,
} from 'react-router-dom';
import {
  ArrowUpRight,
  Boxes,
  Building2,
  ClipboardCheck,
  FileInput,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../auth/Auth';
import { can, type Capability } from '../auth/permissions';
import type { Business, Location } from '../api/types';
import { ErrorBox, Loading, useApiQuery } from '../components/ui';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { Dashboard, Reports, Audit } from '../features/reporting';
import { Catalog, ProductDetail } from '../features/catalog';
import { CatalogueImportPage } from '../features/catalogue-import';
import { Inventory, Movements, Counts, CountDetail, Imports } from '../features/inventory';
import { Employees, Platform } from '../features/administration';
import { SettingsPage, BranchSettingsPage } from '../features/settings';
import { OnboardingPage } from '../features/onboarding';
import { TaxSettingsPage } from '../features/tax';
import { managesBusiness } from '../lib/configuration';
import { Checkout, Orders, Storefront, StoreEntry, PublicOrder } from '../features/commerce';

import type { Workspace } from './workspace';
import { Brand } from '../components/Brand';
import {
  LoginPage,
  RegisterPage,
  ForgotPasswordPage,
  VerifyEmailPage,
  ResetPasswordPage,
  AcceptInvitationPage,
} from '../auth/Pages';
import { SessionNotice, SessionPending } from '../auth/AccountUI';
import { BusinessPage, BusinessSwitcher } from '../features/businesses';
import { SecurityPage } from '../features/security';

const PosPage = lazy(async () => ({ default: (await import('../features/pos')).PosPage }));
const SaleDetail = lazy(async () => ({ default: (await import('../features/sale')).SaleDetail }));
const PurchasingPage = lazy(async () => ({
  default: (await import('../features/purchasing')).PurchasingPage,
}));
const PurchaseDetail = lazy(async () => ({
  default: (await import('../features/purchasing')).PurchaseDetail,
}));
const TransfersPage = lazy(async () => ({
  default: (await import('../features/transfers')).TransfersPage,
}));
const TransferDetail = lazy(async () => ({
  default: (await import('../features/transfers')).TransferDetail,
}));
function Deferred({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Loading text="Loading operations screen..." />}>{children}</Suspense>;
}

function AccountGuard({ platform = false }: { platform?: boolean }) {
  const { identity, transitioning, recoveryCodes } = useAuth();
  if (transitioning) return <SessionPending />;
  if (!identity || identity.purpose !== 'FULL' || recoveryCodes.length)
    return <Navigate to={platform ? '/platform/login' : '/login'} replace />;
  if (identity.operator !== platform)
    return <Navigate to={identity.operator ? '/platform/login' : '/login'} replace />;
  return <Outlet />;
}
function Guard({ capability, operator = false }: { capability?: Capability; operator?: boolean }) {
  const { user, logout, transitioning } = useAuth();
  const workspace = useOutletContext<Workspace | undefined>();
  if (transitioning) return <SessionPending />;
  if (!user) return <Navigate to="/login" replace />;
  if (operator ? !user.operator : user.operator)
    return <Navigate to={user.operator ? '/platform/businesses' : '/app'} replace />;
  if (operator && !['SUPER_ADMIN', 'PROVISIONER'].includes(user.platformRole || ''))
    return (
      <div className="page">
        <h1>Platform access unavailable</h1>
        <p>
          This platform role does not permit business provisioning. Tenant employee permissions
          cannot grant platform authority.
        </p>
        <button className="button secondary" onClick={logout}>
          Sign out
        </button>
        <Link className="text-link" to="/platform/security">
          Account & security
        </Link>
      </div>
    );
  if (capability && !can(user, capability))
    return (
      <div className="page">
        <h1>Access unavailable</h1>
        <p>Your role cannot use this page.</p>
        <Link to="/app">Return to workspace</Link>
      </div>
    );
  return <Outlet context={workspace} />;
}
function Shell({ operator = false }: { operator?: boolean }) {
  const { user, identity, logout } = useAuth();
  const route = useLocation();
  const branchRequired =
    /^\/app\/(inventory|movements|counts|batches|imports\/opening|pos)(\/|$)/.test(route.pathname);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number>();
  const business = useApiQuery<Business>('/api/business', !operator);
  const locations = useApiQuery<Location[]>('/api/v1/branches', !operator);
  const active = (locations.data || []).filter((l) => !!l.active);
  const locationId = selected && active.some((l) => l.id === selected) ? selected : active[0]?.id;
  const links = operator
    ? [
        { path: '/platform/businesses', name: 'Businesses', icon: Building2 },
        { path: '/platform/security', name: 'Account & security', icon: Users },
      ]
    : [
        { path: '/app', name: 'Overview', icon: LayoutDashboard },
        { path: '/app/products', name: 'Products', icon: Package },
        { path: '/app/inventory', name: 'Inventory', icon: Boxes },
        { path: '/app/batches', name: 'Batches & expiry', icon: Boxes },
        ...(can(user, 'manage')
          ? [
              { path: '/app/purchasing', name: 'Purchasing', icon: ShoppingBag },
              { path: '/app/transfers', name: 'Transfers', icon: Boxes },
            ]
          : []),
        ...(can(user, 'counts')
          ? [{ path: '/app/counts', name: 'Stock counts', icon: ClipboardCheck }]
          : []),
        ...(can(user, 'manage')
          ? [{ path: '/app/imports/opening', name: 'Opening import', icon: FileInput }]
          : []),
        ...(can(user, 'checkout')
          ? [{ path: '/app/pos', name: 'Point of sale', icon: ShoppingCart }]
          : []),
        { path: '/app/orders', name: 'Orders', icon: ShoppingBag },
        { path: '/app/movements', name: 'Movements', icon: History },
        { path: '/app/security', name: 'Account & security', icon: Users },
        ...(managesBusiness(user, identity)
          ? [{ path: '/app/onboarding', name: 'Setup checklist', icon: ClipboardCheck }]
          : []),
        ...(can(user, 'reports')
          ? [
              { path: '/app/reports', name: 'Reports', icon: LayoutDashboard },
              { path: '/app/audit', name: 'Audit activity', icon: History },
            ]
          : []),
        ...(can(user, 'employees')
          ? [
              { path: '/app/employees', name: 'Team', icon: Users },
              { path: '/app/settings', name: 'Settings', icon: Settings },
            ]
          : []),
      ];
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to workspace
      </a>
      <aside className={`sidebar ${open ? 'is-open' : ''}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-only"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X />
          </button>
        </div>
        <div className="workspace-label">
          <span className="workspace-avatar">
            {operator ? 'P' : (business.data?.name || 'O')[0]}
          </span>
          <div>
            <strong>
              {operator ? 'Platform workspace' : business.data?.name || 'Your business'}
            </strong>
            <small>{operator ? 'Provisioning & access' : 'Inventory management'}</small>
          </div>
        </div>
        <p className="nav-caption">WORKSPACE</p>
        <nav id="workspace-navigation" aria-label="Workspace navigation">
          {links.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/app'}
              onClick={() => setOpen(false)}
            >
              <item.icon size={18} />
              {item.name}
            </NavLink>
          ))}
        </nav>
        {!operator && user?.businessId && (
          <Link className="store-link" to={`/store/${user.businessId}`}>
            <ShoppingBag size={18} /> Open storefront <ArrowUpRight size={16} />
          </Link>
        )}
        <div className="sidebar-bottom">
          <div className="demo-pill">
            <span /> Development workspace
          </div>
          <p>
            Connected inventory.
            <br />
            Confident decisions.
          </p>
        </div>
      </aside>
      {open && (
        <button
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="workspace-main">
        <header className="topbar">
          <button
            className="icon-button mobile-only"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="workspace-navigation"
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            Workspace <span>/</span>{' '}
            <strong>{operator ? 'Platform' : business.data?.name || 'Orvexa'}</strong>
          </div>
          <div className="topbar-right">
            {!operator && <BusinessSwitcher />}
            {!operator && (
              <label className="location-control">
                <Building2 size={15} />
                <span className="sr-only">Active location</span>
                <select
                  name="activeLocation"
                  value={locationId || ''}
                  onChange={(e) => setSelected(Number(e.target.value))}
                >
                  {active.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <span className="user-avatar">
              {user?.firstName[0]}
              {user?.lastName[0]}
            </span>
            <div className="user-summary">
              <strong>
                {user?.firstName} {user?.lastName}
              </strong>
              <small>
                {operator ? 'Platform staff' : user?.role?.toLowerCase().replaceAll('_', ' ')}
              </small>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="page"
          key={`${user?.id}-${user?.membershipId}`}
        >
          <SessionNotice />
          {!operator && (business.isPending || locations.isPending) ? (
            <Loading text="Loading your business and permitted branches…" />
          ) : business.error || locations.error ? (
            <section className="panel padded">
              <h1>Workspace unavailable</h1>
              <ErrorBox error={business.error || locations.error} />
              <button
                className="button secondary"
                onClick={() => {
                  void business.refetch();
                  void locations.refetch();
                }}
              >
                Retry loading workspace
              </button>
            </section>
          ) : (
            <>
              {!operator && !active.length && (
                <section className="panel padded">
                  <h2>No permitted active branches</h2>
                  <p>
                    Stock and checkout require a permitted active branch. The dashboard and business
                    setup remain available.
                  </p>
                  {can(user, 'settings') ? (
                    <Link className="text-link" to="/app/settings/branches">
                      Create or activate a branch
                    </Link>
                  ) : (
                    <p>Ask an Owner or Administrator to review your branch access.</p>
                  )}
                </section>
              )}
              {(!branchRequired || operator || active.length > 0) && (
                <Outlet
                  key={
                    branchRequired || ['/app/purchasing', '/app/transfers'].includes(route.pathname)
                      ? locationId
                      : 'business'
                  }
                  context={
                    { locationId, business: business.data, locations: active } satisfies Workspace
                  }
                />
              )}
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>ORVEXA BY OSYNTRA</span>
          <span>Online workspace · No bank terminal integration</span>
        </footer>
      </div>
    </div>
  );
}
export function App() {
  return (
    <>
      <ConnectionBanner />
      <Routes>
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/platform/login" element={<LoginPage platform />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
        <Route element={<AccountGuard />}>
          <Route path="/businesses" element={<BusinessPage />} />
          <Route path="/account/security" element={<SecurityPage standalone />} />
        </Route>
        <Route element={<AccountGuard platform />}>
          <Route path="/platform/security" element={<SecurityPage platform />} />
        </Route>
        <Route element={<Guard />}>
          <Route element={<Shell />}>
            <Route path="/app" element={<Dashboard />} />
            <Route path="/app/products" element={<Catalog />} />
            <Route path="/app/products/:id" element={<ProductDetail />} />
            <Route path="/app/inventory" element={<Inventory />} />
            <Route path="/app/movements" element={<Movements />} />
            <Route path="/app/batches" element={<BatchesPage />} />
            <Route path="/app/security" element={<SecurityPage />} />
            <Route path="/app/orders" element={<Orders />} />
            <Route
              path="/app/orders/:id"
              element={
                <Deferred>
                  <SaleDetail />
                </Deferred>
              }
            />
            <Route element={<Guard capability="counts" />}>
              <Route path="/app/counts" element={<Counts />} />
              <Route path="/app/counts/:id" element={<CountDetail />} />
            </Route>
            <Route element={<Guard capability="manage" />}>
              <Route path="/app/imports/opening" element={<Imports />} />
              <Route
                path="/app/purchasing"
                element={
                  <Deferred>
                    <PurchasingPage />
                  </Deferred>
                }
              />
              <Route
                path="/app/purchasing/:id"
                element={
                  <Deferred>
                    <PurchaseDetail />
                  </Deferred>
                }
              />
              <Route
                path="/app/transfers"
                element={
                  <Deferred>
                    <TransfersPage />
                  </Deferred>
                }
              />
              <Route
                path="/app/transfers/:id"
                element={
                  <Deferred>
                    <TransferDetail />
                  </Deferred>
                }
              />
              <Route path="/app/imports/catalogue" element={<CatalogueImportPage />} />
              <Route path="/app/employees" element={<Employees />} />
              <Route path="/app/settings" element={<SettingsPage />} />
              <Route path="/app/settings/branches" element={<BranchSettingsPage />} />
              <Route path="/app/settings/tax" element={<TaxSettingsPage />} />
              <Route path="/app/onboarding" element={<OnboardingPage />} />
            </Route>
            <Route element={<Guard capability="checkout" />}>
              <Route
                path="/app/pos"
                element={
                  <Deferred>
                    <PosPage />
                  </Deferred>
                }
              />
            </Route>
            <Route element={<Guard capability="reports" />}>
              <Route path="/app/reports" element={<Reports />} />
              <Route path="/app/audit" element={<Audit />} />
            </Route>
          </Route>
        </Route>
        <Route element={<Guard operator />}>
          <Route element={<Shell operator />}>
            <Route path="/platform/businesses" element={<Platform />} />
          </Route>
        </Route>
        <Route path="/store" element={<StoreEntry />} />
        <Route path="/store/:businessId" element={<Storefront />} />
        <Route path="/store/:businessId/cart" element={<Checkout publicStore />} />
        <Route path="/store/:businessId/orders/:id" element={<PublicOrder />} />
        <Route
          path="*"
          element={
            <div className="page">
              <Brand />
              <h1>Page not found</h1>
              <Link to="/">Back to workspace</Link>
            </div>
          }
        />
      </Routes>
    </>
  );
}
