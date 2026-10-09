# ChartPulse simulated-data application

## Streaming runtime

Quotes and chart candles now use authenticated WebSockets instead of recurring browser polling. Separate API, gateway, ingestion, account-sharded evaluator and notification workers share PostgreSQL and Redis. Notification jobs are committed with their alert; service status is visible in Admin.

See RUNTIME-IMPLEMENTATION.md for commands, recovery behaviour, configuration, verification and remaining scale work. Use render.scalable.yaml for the paid multi-service Render topology, or compose.yaml for local PostgreSQL/Redis development. The original render.yaml remains a single-service verification deployment.

37 local functional check groups passed. Distributed failover, external Kafka, Render deployment and million-user capacity have not been verified. Kafka currently exports the PostgreSQL event journal; native partitioned processing and regional routing remain to be implemented.

## Chart workspace upgrade

The chart workspace now includes eight chart types, 13 indicator families, 11 drawing tools, 13 alert conditions, five trigger frequencies, per-account preferences, layouts, templates, watchlists, replay and exports. See CHART-FEATURES.md for the exact feature inventory, verification and remaining differences from TradingView.

## What is implemented

- Customer registration, login, private saved scans and alert rules.
- Admin login, customer pause/activation, feed status and simulation controls.
- 60 explicitly fictional NSE/BSE-labelled instruments, seeded historical candles, recurring quotes and accelerated time (one candle minute every three seconds).
- Screener comparisons, AND/OR and parentheses: `price`, `change_pct`, `volume`, `avg_volume`, `relative_volume`, `open`, `high`, `low`.
- Example: `change_pct <= -3 AND volume > avg_volume`.
- Interactive candlesticks, 1m/5m/15m/1h intervals, pan, zoom, SMA 20 and volume.
- Customer-owned horizontal/trend drawings, deletion, persistence and crossing alerts with a 60-second cooldown. Drawings use extrapolated trend levels.
- Screener entry alerts with a 15-minute rule cooldown; unique TradingView webhook events and a simulated delivery status.
- Persistent local PostgreSQL-compatible database; standard PostgreSQL on Render.

**Simulated prices are not real exchange quotes. No WhatsApp messages are sent in simulated mode, even if credentials are present.** A `simulated` delivery status confirms event processing only. It does not confirm Meta delivery, template approval or receipt on a phone.

## Run locally

1. Extract the source archive into a folder.
2. Install Node.js 20 or newer and run `npm ci`.
3. Copy `.env.example` to `.env`; choose an admin email, a strong admin password and a random session secret.
4. Leave `DATABASE_URL` empty for local development. Data persists in `work/local-db`.
5. Run `npm start`; open http://localhost:3000.
6. Sign in with the configured admin account, or create a customer account.

The currently running local verification instance uses `admin@example.com` / `Local-check-2026!`. This is a temporary local verification credential; replace it before deploying. The archive excludes credentials and local databases.

## Verify workflows manually

1. Create a customer account and run/save a screener.
2. Open Charts with `NSE:SIM001`. Choose Horizontal line and click a price; choose Trend line and click two points. Leave crossing alerts checked.
3. Create a screener alert such as `change_pct <= -3 AND price < 70`.
4. In the admin account, pause the feed. Apply Recovery for `NSE:SIM001`, then Drop. Check the customer's Alerts page for `[SIMULATED]` events.
5. Apply Breakout across a saved line to exercise a drawing crossing alert.
6. Pause a customer account; its existing session loses access on the next authenticated API call.

Automated verification passed eight workflow groups. See `simulation-verification.json`. Browser verification also confirmed chart rendering, no console errors and saving a horizontal line through the chart UI. Licensed TrueData, Meta WhatsApp delivery and remote Render deployment have not been verified.

## Deploy to Render

1. Push the extracted source to a Git repository accessible to your Render account.
2. In Render, create a Blueprint from that repository. The included `render.yaml` creates the web service and PostgreSQL database.
3. Provide `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD` when prompted. The session secret is generated automatically.
4. Deploy and open the service URL. Confirm the SIMULATED DATA banner; exercise the steps above.

No provider or Meta credentials are needed for this deployment. The Blueprint uses free plans for development verification. Check Render's current free-plan availability and retention limits before using them; use an always-on service and durable database plan for a customer launch.

**Deployment is prepared but not completed:** this workspace has no connected Git repository/Render deployment credentials. No public Render URL has been created.

## Switch to licensed market data later

1. Obtain provider credentials and rights for your customer display/redistribution use case.
2. Set `MARKET_DATA_PROVIDER=truedata`, `TRUEDATA_USERNAME`, `TRUEDATA_PASSWORD`, `MARKET_DATA_MARKET=NSE,BSE`, and `MARKET_DATA_REDISPLAY_APPROVED=true` only after approval.
3. Restart the service and import your provider's instrument-master CSV through Admin. Simulated instruments are deactivated when switching provider.
4. Validate the provider's actual tick field mappings, exchange identifiers, reconnect behaviour and historical-data API. The current licensed chart is a separate TradingView embed; the integrated chart's licensed historical adapter still needs implementation.
5. Obtain TradingView Advanced Charts library access separately if using their full chart library. This application does not contain that proprietary library or all TradingView drawing tools/indicators/Pine Script.
6. Configure Meta WhatsApp Business credentials and an approved template with three body parameters: symbol, title and detail. Obtain recipient opt-in. Verify actual delivery and retries using your own test recipient before enabling customers.

Before a commercial launch, complete security review, rate limiting, monitoring, database backups, account recovery, live-feed acceptance checks and an always-on alert worker. The implementation is functional for simulated-data development, and is not claimed ready for a commercial market-data launch.

## Separate portals

Customer login: /app/login. Customer registration: /app/register. Administrator login: /admin/login. Both portals use independent sessions and enforce account roles. See PORTALS.md for details.
