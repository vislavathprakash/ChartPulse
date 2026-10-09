# Email alerts and Google customer sign-in

## Implementation

Email delivery uses Resend's HTTPS API with eight-second timeouts, durable outbox jobs, retries, provider idempotency keys, and independent channel status. Admin → Failed deliveries includes email failures. API acceptance is recorded; recipient delivery/bounce webhooks are not implemented, so `done` means provider accepted, not inbox delivery.

Customers verify their account email, explicitly enable email alerts in Workspace settings, and can disable them there. Verification links expire after 30 minutes and require signing in to the same customer account and clicking Confirm email verification. Google-created/linked accounts have a verified email; alerts are still opt-in. Screener, drawing and TradingView events follow account email preferences. Technical alerts additionally select Email, All channels or In-app only. In-app delivery always remains available.

Google uses the authorization-code flow with PKCE, session-bound single-use state, nonce, and Google's official ID-token verifier. Only customer accounts are created. Administrator login is separate. Google subject IDs are unique; accounts are not linked automatically just because an email matches. An existing password customer signs in, opens Workspace settings, and connects the Google identity with that same email. Google-only accounts have no password login.

## Render configuration

The existing free Blueprint remains unchanged. Add these environment variables to the application service in Render after its public URL exists:

```text
APP_BASE_URL=https://YOUR-SERVICE.onrender.com
GOOGLE_CLIENT_ID=your-web-client-id
GOOGLE_CLIENT_SECRET=your-web-client-secret
RESEND_API_KEY=your-sending-api-key
EMAIL_FROM=ChartPulse <alerts@your-verified-domain.example>
EMAIL_SEND_IN_SIMULATION=false
```

For distributed deployment, configure Google variables and APP_BASE_URL on API; configure Resend and APP_BASE_URL on delivery. All instances use the same shared session secret and database. No provider secrets are committed to Git.

### Google

1. In Google Cloud, configure Google Auth Platform branding, audience and basic profile/email scopes.
2. Create an OAuth client of type Web application. Add the exact authorized redirect URI `https://YOUR-SERVICE.onrender.com/api/auth/google/callback`.
3. For local development also add `http://localhost:3000/api/auth/google/callback` and set local APP_BASE_URL to `http://localhost:3000`. Ports/hostnames must match exactly.
4. Configure the client ID and secret in Render environment variables. If the OAuth application is in testing, add permitted test users; complete Google's production publishing requirements before customer launch.
5. Redeploy. The customer login/register page enables Continue with Google when configured. No Google access/refresh tokens are stored.

### Email

1. Create a Resend sending API key and verify your sender domain with its required DNS records. Set EMAIL_FROM to an address on that domain.
2. Add the key/sender to Render and redeploy. Resend account quotas and domain restrictions still apply.
3. A customer opens Workspace settings, requests a verification email, follows the link while signed in, confirms verification, then opts in.
4. Synthetic market alerts do **not** send real emails by default. Set EMAIL_SEND_IN_SIMULATION=true only when intentionally testing real email sends from fictional events. Verification emails are real whenever configured and requested.
5. Create a technical alert with Email + in-app or All channels. Delivery statuses appear alongside each alert. Disabling opt-in or pausing the account prevents queued emails from being sent when the worker checks the recipient.

## Limits and verification status

Provider credentials are not available in this workspace. Google account sign-in and real inbox delivery have not been exercised. Earlier 37 local workflow checks predate this change; they are not evidence that these integrations have been tested. This update is syntax-checked and has no new automated test run.

Email retries stop before Resend's 24-hour idempotency retention window to avoid blindly resending ambiguous older messages. Logs store a generic provider status, not response bodies or secrets. Verification requests have a one-minute per-account cooldown. Providers still require configuration; a configured flag is not proof of delivery.

References: [Google server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).
