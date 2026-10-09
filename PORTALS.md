# Customer and administrator portals

## Local URLs

- Customer login: http://localhost:3000/app/login
- Customer registration: http://localhost:3000/app/register
- Administrator login: http://localhost:3000/admin/login

Customer accounts use registration. Administrator accounts are provisioned by ADMIN_EMAIL and ADMIN_PASSWORD in the server environment. Existing administrator accounts sign in through the administrator login only. The development administrator is admin@example.com; use the password supplied in the chat. Production credentials must be set separately.

## Separation

The portals have separate HTML pages, JavaScript bundles, navigation, and login endpoints. They share the backend and database, so one Render web service serves both portals. On Render, replace localhost with your deployed service URL.

Customers have charts, indicators, drawings, layouts, watchlists, screeners, personal alerts, WhatsApp preferences, and their private TradingView webhook. Administrative controls are absent from the customer application.

Administrators have customer activation/pause, customer search, platform event counts, licensed instrument import and market feed status, simulated feed controls, failed delivery monitoring, and service status. There is no public administrator registration or customer chart workspace in the admin application. Customer search runs on the server with prefix matching and cursor pagination in pages of 100 accounts.

Customer and admin sessions use distinct cookie names and signing secrets. Both accounts can remain signed in in one browser. Signing out of one portal leaves the other session active. Role and active status are checked against the database for protected requests. Pausing a customer revokes their access. Existing account data is preserved; old combined-login sessions require signing in again.

## Verification

Ten access-separation checks cover separate pages, forced customer registration, wrong-portal credentials, cross-portal API access, simultaneous sessions, pause/revocation, independent logouts, and cookie substitution. Existing simulation and chart verification scripts use the new admin login endpoint. See portal-verification.json for results.

## Deployment and data status

The source includes render.yaml for Render with PostgreSQL. A remote deployment has not been completed. Market prices and WhatsApp deliveries remain simulated until the licensed data and WhatsApp Business integrations are configured.
