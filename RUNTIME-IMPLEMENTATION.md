# ChartPulse streaming and distributed runtime implementation

## What changed

The customer and admin portals now run on a service-aware backend. Authenticated WebSockets replace three-second chart polling and five-second dashboard polling. Initial chart history and private drawings are fetched once; market frames update the latest candles and subscribed quote rows. Changing symbols/intervals, reconnecting or leaving replay requests a fresh history snapshot when needed.

The implementation includes:

- Separate API, WebSocket gateway, ingestion, account-sharded evaluator, notification worker and optional Kafka relay roles.
- One feed/simulation owner using a dedicated PostgreSQL advisory-lock connection, with persisted ownership epochs to reject stale commits. Additional ingestion processes wait as standbys. Do not use a transaction pooler for the leadership connection.
- Durable ordered market journal, a versioned latest snapshot, compressed synthetic history snapshots, transactional evaluator checkpoints, and command admission for administrative feed changes.
- Shared Redis quote cache and cross-process broadcast, with database catch-up when a broadcast is missed. Redis is required in the distributed production topology.
- Notification jobs inserted by an alert-table trigger in the same transaction as the alert. Workers claim jobs with SKIP LOCKED, leases and claim tokens. Simulated events never send WhatsApp messages. The external delivery path has a timeout, retries and failed-job status; external sends remain at-least-once attempts and ambiguous successful sends can be retried.
- Twenty-second single-use stream tickets tied to an active customer session. Administrators cannot use customer stream tickets. Credentials are sent in the initial authenticated frame, never in a URL.
- Origin checks, authentication deadlines, bounded WebSocket input/outbound buffers, subscription limits, reconnect jitter, logout/pause revocation and periodic session revalidation.
- Four display batches/second maximum, at most 50 subscribed symbols and two chart symbols per tab. Watchlist pages contain 48 rows. Candle calculations and encoded batch structures are shared within each gateway for matching subscriptions.
- Account-sharded alert queries, per-scan shared indicator calculations, cached parsed screener queries and versioned screener result caching. Rule edits request account-specific baseline evaluation in distributed mode.
- Password hashing/comparison in a bounded worker-thread pool, request limits, database pool limits, indexes and cursor-based customer pagination.
- Admin service status, delivery backlog, request latency samples, commit latency, gateway quote age, evaluator input age, event-loop delay and memory metrics.
- Docker and paid Render launch configurations.

## Local application

The existing application remains available at:

- Customer: http://localhost:3000/app/login
- Admin: http://localhost:3000/admin/login

The running development instance uses the previously supplied local credentials. It uses **standalone** mode: one Node process and persistent PGlite. Standalone is a convenient local runtime, not a horizontally scalable or highly available deployment. Synthetic time advances one fictional minute every three seconds; WebSocket delivery does not turn that synthetic source into real exchange data.

For a fresh checkout:

```text
npm ci
```

Copy `.env.example` to `.env`, configure SESSION_SECRET, ADMIN_EMAIL and ADMIN_PASSWORD, and run:

```text
npm start
```

No database files, private `.env` files or account records are included in the source archive.

## Service roles

| Command | Responsibility | Instances |
|---|---|---|
| npm run start:api | Account APIs, both portals, ticket issuance | Multiple replicas with shared session/database state |
| npm run start:gateway | Stream endpoint and health endpoint; no public account/admin APIs | Multiple replicas/cells |
| npm run start:ingestion | Own provider/simulation, persist journal/snapshots, execute admitted feed commands | One active leader; optional standby processes |
| npm run start:evaluator | Replay journal and evaluate one customer-account shard | One active owner per configured shard; optional standbys |
| npm run start:delivery | Claim and process notification jobs | Multiple workers with row-level claims |
| npm run start:relay | Export committed journal quotes to Kafka, keyed by symbol | One active owner, optional standby |

Every separate role requires DATABASE_URL. All distributed production roles except the optional relay require REDIS_URL. Keep SESSION_SECRET, source namespace and ALERT_SHARDS consistent across the topology. Each evaluator also sets its distinct ALERT_SHARD, starting at zero. Missing shards mean those customers' alerts are not evaluated; service status must be monitored.

ALERT_SHARDS is persisted and checked. Do not change it on a running deployment. Stop evaluators, migrate their checkpoints and rule ownership, then change the topology in a controlled migration. A generic online resharding tool is not included.

## Local distributed topology

`compose.yaml` includes PostgreSQL, Redis, API, gateway, ingestion, two evaluator shards and a delivery worker:

```text
docker compose up --build
```

Published API and gateway ports bind only to loopback. API URL is http://localhost:3000; the gateway is ws://localhost:3001/stream. The browser obtains its ticket from the API and connects to the gateway automatically. Compose uses a separate PostgreSQL volume and development-only credentials; its admin password is `Compose-local-2026!`. Do not reuse these credentials for a public deployment.

Docker is not installed on the current host, so this topology has not been executed here. External PostgreSQL/Redis connections and multi-process leadership must be verified before deployment. The standalone integration checks exercise the actual SQL schema, outbox, authorization and streaming path through PGlite, but do not certify PostgreSQL failover or Redis/Kafka availability.

## Render deployment

`render.scalable.yaml` defines a **paid launch topology**, not a million-user instance preset. It creates a pooled PostgreSQL database, Redis-compatible Key Value instance, API web service, dedicated gateway web service, ingestion worker, two evaluators and a delivery worker in Singapore.

1. Put the source in a connected Git repository. Create a Render Blueprint using `render.scalable.yaml`.
2. Set the API's ADMIN_EMAIL and ADMIN_PASSWORD.
3. Set ALLOWED_ORIGINS on API and gateway to the exact public API origin, for example `https://your-api.onrender.com`. Add your own application domain if used. Do not use a wildcard.
4. Set the API's STREAM_URL to the gateway's public `wss://.../stream` URL.
5. Use the shared SESSION_SECRET generated in the environment group. DATABASE_URL uses the transaction-pool endpoint; LEADER_DATABASE_URL uses the direct endpoint.
6. TLS verification is enabled by default in production. Configure a trusted CA if your database needs one; confirm provider-specific internal connection settings before launch. Do not disable certificate verification as a default deployment workaround.
7. Wait until ingestion and both evaluator shards appear in Admin → Service status. Register a customer, create an alert and exercise an admitted simulation scenario.
8. Scale API/gateway replicas and delivery workers independently. Ingestion replicas are standbys, not additional independent simulated clocks.

The existing `render.yaml` remains the simpler standalone evaluation configuration. Use the distributed Blueprint for shared workers. No paid resources have been provisioned and no Render URL has been deployed in this task. The repository/account deployment connection is not available here.

For licensed mode, configure display approval consistently and place provider credentials on ingestion. API/gateway instances do not need provider login credentials to read an approved shared snapshot. Configure WhatsApp credentials on delivery workers and the relevant API/evaluator processes that determine whether events should be queued. Existing licensed historical/technical adapters still need completion before the full native chart workspace can use real NSE/BSE candles.

Render fields follow the current [Blueprint specification](https://render.com/docs/blueprint-spec). Account limits, plan eligibility, database TLS and actual resource capacity still require validation in the target account.

## Kafka adapter status

Kafka is implemented as an **optional durable-journal export relay**, not as the authoritative evaluator input. Configure KAFKA_BROKERS, KAFKA_MARKET_TOPIC, TLS and optional SASL credentials, create the topic on your managed broker, then run the relay role. Quotes use symbol keys; records carry stable event IDs. Broker acknowledgement precedes relay checkpoint advancement. A crash between the two can replay an exported record, so downstream consumers must deduplicate event IDs.

The tested launch data path is PostgreSQL journal → evaluator plus Redis → gateway. Native Kafka-partition evaluator ownership, a separate historical/analytical service and regional gateway routing are still architectural migration work. The relay has not been exercised against an external broker in this environment.

## Verification

The local checks passed:

- 10 customer/admin separation groups.
- 13 chart, drawing, indicator, alert-frequency and ownership groups.
- 8 original simulation, screener and webhook groups.
- 6 stream groups: customer-only/single-use tickets, bounded subscriptions, pushed quotes and interval candles, private transactional-outbox events, snapshot/service metrics, and logout revocation.
- Browser rendering showed the chart's streaming status and no captured JavaScript errors; the admin portal displayed service progress and delivery backlog.

These are functional checks, **not capacity benchmarks**. Rolling latency samples in the admin API are operational diagnostics, not verified million-user p95/p99 measurements. Market journal replay and multi-process fencing are implemented but have not been exercised against a real distributed PostgreSQL/Kafka failover topology here.

## Before claiming million-user capacity

This implementation is substantial groundwork, but the complete million-user deployment from SCALE-ARCHITECTURE.md is **not finished or certified**. The following remain:

1. Provision and validate managed PostgreSQL, Redis, broker, gateway cells and network/egress capacity. Confirm TLS, leader failover, queue leases and source reconnection.
2. Replace the launch journal/checkpoint path with the planned native partitioned market-log consumers if profiling shows the PostgreSQL bridge limits ingestion throughput. Rule processing still queries active rules per account shard; threshold indexes and retained compiled rule state are needed for the heaviest millions-of-rules workloads.
3. Introduce quote-distribution cells/interest routing. Gateways currently receive the shared market broadcast and private-event broadcast at the server and filter delivery; this is not the final regional million-connection fan-out topology.
4. Complete licensed historical/candle ingestion and indicator warm-up; move historical archives and advanced screeners to their dedicated services as load requires.
5. Add automated, replay-safe retention/archival. Market journals/checkpoints are retained rather than automatically purged so lagging consumers cannot silently lose their inputs. Monitor disk usage; do not run an unbounded production journal without an approved retention policy.
6. Add the full tracing/metrics export pipeline, operational alerts, backup/restore drills, disaster recovery and regional traffic steering.
7. Enforce commercial WhatsApp quotas and test a realistic trigger burst. The current bounded delivery workers and retry queue isolate charts from delivery work, but do not provide a measured million-message throughput commitment.
8. Run distributed load and failure exercises at 10k, 100k, 500k and 1m concurrent connections. Measure payload sizes, p95/p99, stale updates, CPU, memory, queue age, egress and total cost. Only then set and publish a supported concurrency limit.

The default gateway cap of 10,000 is an admission setting, not an assertion that a gateway instance has been benchmarked to sustain that load. User registration count is not proof of concurrent connection capacity. Zero latency and guaranteed instantaneous WhatsApp delivery remain impossible promises.
