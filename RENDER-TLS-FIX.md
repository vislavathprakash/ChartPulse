# Render PostgreSQL startup fix

The original production configuration enabled certificate validation for Render's internal database connection. Render documents that internal PostgreSQL uses self-signed certificates; the default trust store therefore rejects this endpoint.

The updated database helper supports PG_PUBLIC_HOST to connect to the same instance through its Render public hostname with TLS verification required. Both the normal pool and migration/leadership connection use the helper. No database passwords are copied into source. Existing database network permissions are not changed.

For this deployed free database, set PG_PUBLIC_HOST to `dpg-db4m54c9v7es73ab9mq0-a.oregon-postgres.render.com` in the application service. Leave PG_SSL_REJECT_UNAUTHORIZED=true. The override is restricted to the same internal instance ID and Render's PostgreSQL domain. It requires existing external network access and can add latency.

For a production private-network deployment, provision a trusted certificate chain and configure PG_CA_FILE, or explicitly review the provider's internal TLS trust model. PG_CA_FILE keeps certificate validation enabled. Do not set NODE_TLS_REJECT_UNAUTHORIZED=0.

Reference: [Render PostgreSQL connections and encryption](https://render.com/docs/postgresql-creating-connecting).
