# Orvexa F1 — authentication, memberships and staff invitations

Implemented 2026-11-14 against the sibling Spring backend’s B1 identity and session contracts. F0’s shell/API patterns are retained. This phase ends at F1 for review under the supplied [implementation prompts](../Orvexa_Frontend_Implementation_Prompts.md); the next phase is F2.

## Delivered screens and behavior

| Route | Workflow |
| --- | --- |
| `/login` | Tenant sign-in, verification/MFA prerequisites, recovery codes, business selection |
| `/platform/login` | Distinct Osyntra staff sign-in; mandatory MFA and separate platform authority |
| `/register` | Global identity registration, byte-aware password validation and generic queued-verification response |
| `/forgot-password` | Generic reset-link request without account enumeration |
| `/verify-email` | Explicit single-use verification confirmation or replacement-link request |
| `/reset-password` | Explicit token/new-password confirmation; MFA is unchanged |
| `/accept-invitation` | New-identity creation or inline existing-recipient sign-in, acceptance and fresh-login guidance |
| `/businesses` | Membership list/status, business creation and confirmed business switching |
| `/app/employees` | Current tenant members, roles/status/job titles, branch grants and invitation administration |
| `/app/security` | Global account security, active sessions/revocation, personal security events, optional MFA controls |
| `/account/security` | Same global controls without requiring a selected membership |
| `/platform/security` | Platform identity’s own security/session controls, independent of tenant roles |

The header shows current business/branch and links to the business selector. Switching removes unsaved forms and the staff cart; existing reservations/orders remain server-side and must be reviewed in their original business. Public storefront credentials remain separate.

Owner/platform MFA enrollment is user-initiated. The screen provides the server’s manual TOTP key, algorithm/digits/period, expiry and an installed-app URI. No external QR-generation service or automatic MFA enrollment is used. Confirmation replaces the session and displays recovery codes exactly as issued; workspace access waits for acknowledgement that they were saved. Codes/keys are not stored in browser storage. Optional-role users can enable MFA from Security and disable it only with password/code when the server permits. Lost-authenticator replacement requires password plus an unused recovery code, revokes sessions and requires re-enrollment.

Team administration edits membership IDs rather than user IDs. Global names/passwords are read-only here. Owner can manage all roles; Administrator cannot grant/edit Owner; Manager is limited to Cashier/Inventory Clerk. Branch options come from permitted active branches. All-branch grants are available only to actors with that scope; owners require them. Last-owner and cross-tenant protections remain authoritative on the server.

## Backend contracts consumed

All identity URLs below use `/api/v1`:

- `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` retain F0 behavior.
- `POST /auth/register` with firstName/lastName/email/password.
- `POST /auth/email-verification` and `/auth/password-reset` with email; generic responses are not treated as evidence an account exists or mail was delivered.
- `POST /auth/email-verification/confirm` with token; `POST /auth/password-reset/confirm` with token/password.
- `POST /auth/mfa/setup`, `/confirm`, `/verify`, `/recover`, `/disable`; grants returned by completion/recovery/disable replace the prior token. Setup from an already-full session requires the current password.
- `GET /memberships`; `POST /auth/business` with **membershipId**, not a client-selected business ID. Replace the returned token and fetch its self response before showing data.
- `POST /businesses` with name/locationName/currency/defaultThreshold; creation returns reauthenticationRequired rather than an immediately usable new membership session.
- `GET /business/memberships`, `PUT /business/memberships/{id}` with role/status/jobTitle/allBranches/branchIds. Updates revoke the affected identity’s sessions.
- `GET/POST /invitations`, `DELETE /invitations/{id}`, `POST /invitations/accept`. Existing-recipient acceptance sends only token with the current identity credential; anonymous new recipients supply names/password. Acceptance revokes sessions.
- `GET /auth/sessions`, `DELETE /auth/sessions/{id}`, `POST /auth/logout-all`, `GET /auth/security-events`.
- `GET /auth/mail-preview` is requested only after explicit development-preview interaction. Backend loopback/profile/scope checks remain authoritative; production builds hide this helper.
- Existing `GET /api/business` and `GET /api/v1/branches` still populate the workspace and branch choices.

No endpoints were invented or added to the backend. No database migration or dependency addition was needed.

## Session, cache and capability decisions

1. Bearer sessions, partial-auth identity and once-only recovery codes live only in React/provider memory. Reload requires a fresh sign-in. Recovery codes are removed from the retained grant and cleared after acknowledgement/logout.
2. Token-changing commands remove access to the old workspace **before** submitting, cancel queries and clear caches. The new grant is used to fetch self before enabling tenant actions. A response from the previous session cannot populate the replacement workspace or sign it out with a late 401.
3. Definite rejected MFA codes retain the restricted challenge/setup so the user can correct them. An ambiguous token change requires sign-in again. Newly returned recovery codes survive a subsequent profile-fetch failure so the user can still save them.
4. Verification/reset/acceptance/create-business success requires reauthentication. Ambiguous session-revoking responses request sign-in and review rather than claiming completion. “Sign out all” also clears local access if server revocation cannot be confirmed.
5. URL account capabilities are copied into component memory, then removed using history replacement. No confirmation POST occurs just from visiting a link. The document uses no-referrer. Existing-account invitation login stays on its acceptance page so its token need not be persisted or added to another URL.
6. Platform identities are not tenant employees: they cannot join a merchant business via the invitation UI. Tenant permissions never grant platform provisioning. Support-only staff can reach their own security controls without receiving provisioning access.

## API limits represented explicitly

- There is no dedicated invitation resend endpoint. **Reissue** collects the complete intended grants, revokes a pending old link, then issues a new one. If issuing fails after revocation, the original stays revoked and the UI says the replacement is unconfirmed. Retrying that open form skips the completed revocation. No automatic POST retry is used.
- Other members’ and invitations’ explicit branch IDs are not returned by their list endpoints. The UI never invents them: an explicit-branch edit requires a complete replacement selection and acknowledgement. All-branch grants can be retained directly. A true prefilled-grant editor needs a backend detail endpoint.
- Invitation lists are bounded to the most recent 200 scoped records; expiry is derived from expires_ms and checked again by the server. No pagination total or successful acceptance is fabricated.
- The session list does not identify the current browser session. Revoke controls explain that the selected row may sign out this browser. No device/IP labels are invented.
- Email preview is scoped to messages received or issued by the authenticated identity and only works when enabled on loopback. An actually forgotten password cannot be recovered through anonymous preview; configure real SMTP or use the backend’s deliberate development procedure. No public inbox is exposed.
- Full role/branch grants, invitation issuer authority, MFA replay/expiry, generic token failures, rate limits and last-owner protection remain server checks. UI gating is not an authorization boundary.
- Enrollment currently supports manual authenticator entry and installed-app URI rather than an embedded QR image. Physical authenticator setup and secure recovery-code custody remain the user’s responsibility.

## Changed files and implementation notes

- `src/api/identity.ts`: typed grants, membership/invitation/security records and anonymous account commands.
- `src/auth/Auth.tsx`: authenticated identity requests, token rotation, revocation/expiry, recovery-code acknowledgement and stale-response guards.
- New `src/auth/AccountUI.tsx`, `AccessSteps.tsx`, `Pages.tsx`, `queries.ts`: reusable account forms, MFA and security prerequisites, link confirmations and scoped development preview.
- New `src/features/businesses.tsx`, `team.tsx`, `security.tsx`: membership choice/switching, invitations/grants and account security.
- `src/app/App.tsx`: account routes/guards, separate platform entry and business switcher; `administration.tsx` now routes Employees to the new team implementation rather than duplicate legacy account creation.
- New `src/lib/identity.ts`, `useLinkToken.ts`: password/role/expiry helpers and ephemeral link-token handling.
- `src/styles.css`, `index.html`: responsive account/grant layouts and no-referrer policy.
- Tests add account/link/MFA, session-transition/isolation and membership/invitation scenarios. Dialog behavior is polyfilled only in the test environment.

## Verification

Final automated checks: **69 tests passed, zero failed, across eight files**. `npm.cmd run build` includes successful TypeScript checking; `npm.cmd run format:check` and `git diff --check` pass. Existing catalog/count/public-demo tests continue passing.

New focused cases cover explicit verification and token stripping, expired links, generic registration/reset responses, UTF-8 password limits, new/existing invitation acceptance, platform exclusion, MFA rejected-code recovery and lost-authenticator replacement, once-only code acknowledgement, stale tenant responses, uncertain session switches/revocations, manager/branch restrictions and partial revoke/reissue failure.

Live Chrome used an **independently initialized SQLite/demo backend on 18081** and a separate Vite process on 5181, with SMTP explicitly disabled and an ephemeral test-only security key. User services on 8080/5173, existing database/environment/passwords/MFA/security key were untouched. Disposable `.local-demo/f1` artifacts are ignored and are not business backups.

Browser workflows passed:

1. Owner login → MFA setup with real server-generated key/current TOTP → ten recovery codes → acknowledgement → dashboard.
2. Create a second business → fresh login using an unused recovery code → two-membership picker → switch to the new business → switch back.
3. Issue a branch-limited invitation → scoped local preview → new-recipient acceptance → sign-in as Cashier with only the granted branch and appropriate navigation.
4. Invite that existing recipient into the second business → inline recipient sign-in → token-only acceptance → fresh login → two memberships and only the new permitted branch.
5. Register a new identity → limited verification login → local verification link → explicit confirmation → fresh login without a business → global security controls.
6. Request reset through local preview → explicit reset → authenticate with the new password → revoke all sessions → sign-in screen.

Employee token/recovery data did not appear in localStorage/sessionStorage during these flows. Registration layout was inspected at desktop/narrow widths and its browser console had no runtime errors. Other critical screens were exercised through accessible form controls and their labels. Full screen-reader/contrast audit remains F9; real SMTP delivery, physical-device authenticator usability and deployment security review are not claimed by these local tests. The backend’s Java suite was not rerun.

## Demonstration walkthrough

1. Start Spring with the configured demo profile/password and Vite as described in the README. Keep the backend security key intact; never regenerate it to solve a login issue.
2. Sign in as automotive owner on `/login`, or platform staff on `/platform/login`. If enrollment is required, explicitly start it, add the manual key to an authenticator, confirm a current code and save the recovery codes before continuing. Existing MFA users use a current code or unused recovery code.
3. Open the header’s business switcher. Confirm the current membership; create a business if desired, then sign in again and choose it. Switch back and verify that branch selection/data/cart do not remain from the prior business.
4. In Team, invite a new or existing email with a role and permitted branches. With local preview deliberately enabled, expand the scoped message and open its account link. New recipients create an identity; existing recipients sign in inline. Sign out the issuer before accepting as the recipient. Acceptance requires a fresh login.
5. Show expired/revoked invitation states, revocation and explicit reissue. In member editing, show the global-name boundary and confirm the replacement branch set. A Manager should not see privileged role choices.
6. Visit Account & security. Review and revoke sessions; show mandatory MFA has no disable control. Optional-role MFA can be enabled/disabled with the required password/code. Authenticator replacement requires password and an unused recovery code.
7. Demonstrate verification/reset links using the configured mail delivery, or scoped local preview during development. Acknowledge generic responses and sign in again after a successful confirmation.

**Next phase: F2 — illustrated progressive onboarding and versioned tax/business/branch settings.** F3–F5 catalogue, inventory/purchasing and payment upgrades remain separate reviews; F1 is not a claim that the complete new Orvexa MVP is finished.
