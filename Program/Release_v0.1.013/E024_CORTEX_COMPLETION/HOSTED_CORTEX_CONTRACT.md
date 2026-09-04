# OpenKai ↔ hosted Cortex contract boundary

Owner: alpha@kaidera (service) with kai@openkai (client). Status: **required contract before hosted implementation; wholly deferred from OpenKai 0.1.13**. This document dispositions E024 decision D3. Existing generic `cortex.apiUrl` and token settings are transport configuration, not evidence that a hosted service is safe, supported, or accepted.

## 1 · Release boundary

OpenKai 0.1.13 adds no hosted-only code, hosted default, account flow, billing flow, or hosted acceptance claim. Local Cortex behavior remains unchanged. A later intent may implement hosted Cortex only after every provider-owned item below has a versioned contract and a disposable acceptance tenant.

Until then:

- OpenKai must not advertise a Kaidera-hosted endpoint as supported.
- A user may point the generic endpoint setting at a compatible deployment at their own risk; this does not create a service commitment.
- Hosted failure degrades to no memory for that turn. It never falls back to the retired local memory pipeline and never reroutes data to another tenant or provider.
- Returning the ordinary lane to `memory.backend=off`, or removing managed `CORTEX_PROJECT`, stops all Cortex traffic without deleting remote data.

## 2 · Discovery, endpoint, and token issuance

The service contract must publish:

1. An HTTPS base URL and region for each tenant, with no credentials embedded in the URL.
2. A versioned `GET /.well-known/cortex` response containing service identity, API revision, capabilities, region, maximum supported client payloads, and deprecation dates.
3. A documented token issuance flow for human operators and non-interactive managed deployments. OpenKai does not collect account passwords or mint service tokens.
4. Separate least-privilege scopes for read/search, memory write, transcript ingest, roster administration, project lifecycle, provider administration, export, and deletion.
5. Token expiry, rotation, overlap, revocation, and compromised-token procedures. Rotation must permit an overlap window; revocation must take effect within a contractually stated maximum.
6. A stable tenant identifier and project identifier returned at issuance. Display names are not authorization boundaries.

Tokens are bearer secrets. OpenKai must never place them in query strings, evidence, telemetry, transcripts, model context, or error text. The provider must redact them from application, proxy, audit, and support logs. Provider administration tokens remain separate from runtime read/write tokens.

## 3 · Transport and authentication

- TLS 1.2 or newer is required; certificate validation and hostname verification cannot be disabled by client configuration.
- Plain HTTP is permitted only for an explicitly local loopback appliance. A hosted hostname over HTTP must fail closed.
- Every authenticated response must carry a request ID. Authentication failures use structured `401` or `403` responses without echoing credentials.
- The contract must state whether IP restrictions, private networking, or mTLS are available. None may be silently required by the base plan.
- Browser-originated authentication is outside the initial client contract; OpenKai is a native CLI/TUI client.

## 4 · Tenant, project, and roster isolation

Authorization must be enforced server-side on every read, write, search, ingest, operation, export, and administrative request. Headers such as `X-Project` and `X-Agent-Name` select an already-authorized resource; they never grant access.

The provider must define and test these invariants:

- A token belongs to exactly one tenant unless it is an explicitly identified service-administration token.
- Project IDs are tenant-scoped and immutable. A request for another tenant or project returns a non-enumerating denial.
- Database row-level security or an equivalent mandatory isolation control applies to primary data, vectors, queues, caches, backups, logs, exports, and support tooling.
- Search cannot return cross-project records. Global caches and rerank batches preserve tenant and project boundaries.
- A roster contains stable agent IDs, display names, roles, active state, and one optional default writer. A caller may write only as an authorized active roster member.
- Missing or ambiguous writers are refused before request content is retained or processed.
- Provider operators' exceptional access is least-privilege, time-bounded, audited, and covered by a documented support-access policy.

## 5 · Project and roster lifecycle

Before hosted acceptance, Cortex must expose versioned typed operations for:

- create or reactivate a project;
- read project state and roster;
- add, update, deactivate, and remove an agent;
- set or clear the default writer;
- archive a project and observe completion;
- restore an archived project when policy permits;
- export and permanently delete a project.

Create/reactivate/archive/delete operations require caller-supplied idempotency keys and observable operation status. `archive` means read/write disabled and retained under policy; it is not deletion. A completed archive must make ordinary project reads and writes return the documented archived/not-found state. Permanent deletion must define queue, vector-index, replica, cache, log, and backup treatment plus the maximum completion time.

OpenKai will not synthesize lifecycle behavior with direct database access or undocumented administrative routes. Missing typed archive support blocks any acceptance drive that writes synthetic hosted data.

## 6 · Retention, export, and deletion

The provider must publish, per data class, the default and configurable retention period for memories, source facts, transcripts, operations, audit logs, service logs, exports, and backups. Transcript ingest remains opt-in and off by default in OpenKai.

Required controls:

- tenant-level retention policy readable through an authenticated API;
- project export through an asynchronous operation, with a manifest, schema/API revision, record counts, and SHA-256 checksums;
- machine-readable deletion status and completion evidence;
- legal-hold behavior that is explicit to the tenant administrator and never silently changes deletion semantics;
- documented backup location classes, encryption, restore objectives, retention, and destruction schedule;
- deletion propagation guarantees for primary storage, indexes, caches, replicas, queues, generated exports, and expiring backups.

An archive, expired subscription, or revoked token must not be represented as deletion. OpenKai must show the service-provided state literally.

## 7 · Limits, cost, and fallback

The provider contract must state request and response size limits, search `top_k` bounds, transcript limits, operation concurrency, rate limits, storage quotas, model/provider usage, region availability, and any billable unit. Quota and spend data must be readable without provider-administration credentials.

- `429` and capacity-related `503` responses include `Retry-After` and a stable structured code.
- Hard quota exhaustion is terminal until configuration changes; transient capacity failure is retryable only within OpenKai's documented hook budget.
- The service must expose warning and hard limits before accepting billable work. No automatic plan upgrade or unbounded provider spend is permitted.
- OpenKai's fallback is to skip hosted recall/write and report the reason. It does not write to disk, switch to local memory, switch regions, or retry against a different tenant.
- The contract must identify behavior when embedding or rerank providers are unavailable. Vector-only operation is a visible capability/degradation state, not silent equivalence.

## 8 · Errors and degraded operation

Every non-success response must use one documented JSON envelope with a stable code, safe message, request ID, retryability, and optional retry delay. At minimum the taxonomy distinguishes:

- authentication missing, expired, or revoked;
- scope denied;
- tenant/project/agent unavailable or archived;
- writer unregistered or inactive;
- validation/payload too large;
- rate, quota, and spend limit;
- unsupported API revision or capability;
- provider degradation;
- transient service failure;
- operation conflict, expiry, or cancellation.

`4xx` contract/configuration failures are not retried automatically except `408`/`429` where the contract explicitly permits it. Timeouts, connection errors, and `5xx` may be retried only within the OpenKai hook budget and with idempotency protection. Error messages and request IDs may be shown; submitted content and secrets may not.

`GET /degradation` or its versioned successor must return explicit component, capability, scope, start time, impact, and retry guidance. An empty list means no known degradation; an unavailable degradation endpoint is shown as unavailable, not `none`.

## 9 · Observability and audit

The service must provide:

- health and capability endpoints that do not expose tenant data;
- tenant-scoped request/operation status keyed by request ID or operation ID;
- audit events for token lifecycle, roster/lifecycle administration, export, deletion, policy change, and exceptional provider access;
- usage and quota metrics by tenant/project and billable category;
- documented status-page and incident-notification channels;
- retention and export controls for audit data;
- enough correlation metadata to investigate a failed call without retaining its secret or full prompt content.

OpenKai may log endpoint origin, project key, operation/request ID, status code, latency, and redacted error code. Content telemetry is off unless a later, separately consented contract adds it.

## 10 · Compatibility and change control

The well-known response and every API response must identify a semantic API revision. The provider publishes an OpenAPI or equivalent machine-readable schema and compatibility policy covering fields, error codes, headers, operation states, and SSE/event replay.

- Additive optional fields may ship within a compatible revision.
- Removing or changing behavior requires a new revision and a published migration window.
- The service must publish minimum/maximum supported OpenKai versions and reject unsupported clients with a stable upgrade-required error.
- Security-critical removals may shorten the window only with an incident notice and explicit affected-version list.
- OpenKai pins the revision it implements and does not infer capability from marketing/service version strings.

Provider and client changes are reviewed and released independently. A hosted service rollout cannot silently activate new OpenKai data paths.

## 11 · Acceptance contract

The provider supplies two disposable tenants in a non-production environment: an ordinary tenant and an isolation peer. Tests use generated non-secret markers and delete both tenants afterward. Direct database access is forbidden.

Hosted implementation cannot ship until evidence proves:

1. endpoint discovery, TLS validation, token issuance, rotation, revocation, and scope denial;
2. project/roster create, writer resolution, archive, restore where supported, export, and permanent deletion;
3. record/search and transcript opt-in within one project;
4. cross-tenant and cross-project denial across search, operations, exports, caches, and administration;
5. rate/quota errors, spend visibility, provider degradation, timeout, retry, and idempotency behavior;
6. audit/request correlation without secret or content leakage;
7. compatibility rejection and supported-revision negotiation;
8. a backup restore into a disposable service with inventory comparison;
9. cleanup in an unconditional `finally`, followed by provider-observed deletion state.

Evidence records client/service versions, API revision, region, redacted tenant/project IDs, commands, literal responses, cleanup result, and production-state comparison. Partial, blocked, or simulated results are not acceptance.

## 12 · Rollback and incident response

Client rollback is immediate traffic cessation: set the ordinary backend to `off`, or remove managed `CORTEX_PROJECT`, then restart the session. This preserves remote data. Token revocation is the provider-side emergency stop.

The provider must document incident ownership, severity/contact channels, tenant notification, credential rotation, export availability, regional failover, and recovery validation. Failover may not cross a contracted residency boundary or weaken tenant isolation. OpenKai never performs automatic destructive cleanup during rollback.

Service exit follows this order: stop writes, export and verify checksums/counts, revoke runtime tokens, archive or request deletion, observe the contracted terminal state, then remove endpoint configuration. If export or deletion fails, retain evidence and escalate; do not claim rollback complete.

## 13 · Ownership and implementation gate

| Deliverable | Owner | Gate state |
|---|---|---|
| Versioned discovery/API/error/operation schema | alpha@kaidera | Required before implementation |
| Token, tenancy, retention, cost, observability, and compatibility policies | alpha@kaidera | Required before implementation |
| Typed roster/archive/export/delete lifecycle | alpha@kaidera | Required before writing acceptance |
| Disposable two-tenant acceptance environment and reset procedure | alpha@kaidera | Required before acceptance |
| OpenKai threat model, client design, and separate implementation intent | kai@openkai | Deferred until provider contract exists |
| Independent implementation/security review | Ren + security reviewer | Required before hosted release |
| Version-specific release consent | CTO | Required after all acceptance gates pass |

This contract document closes only E024's dependency disposition. It does not mark any hosted capability implemented, accepted, or released.
