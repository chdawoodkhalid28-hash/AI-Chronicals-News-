# Cloudflare Admin Login Rate Limiter

## Binding

The Worker uses a Cloudflare Rate Limiting binding named `LOGIN_RATE_LIMITER`. The Wrangler configuration declares namespace `1001` with a limit of 5 login attempts per 60 seconds per client IP.

For a dashboard-managed deployment, create the same Rate Limiting binding in the Worker's settings:

- Binding name: `LOGIN_RATE_LIMITER`
- Namespace ID: `1001`
- Period: `60` seconds
- Limit: `5` requests
- Key: the Worker derives `admin-login:<CF-Connecting-IP>`

## Fail-closed behavior

The login endpoint returns HTTP 503 when the binding is missing, cannot identify the client IP, throws an error, or reports the limit exceeded. This intentionally prevents an unthrottled admin login endpoint from being exposed. Configure the binding before testing Admin login.

The limit applies to all login requests, including successful requests, to avoid allowing password-guessing attempts to bypass the counter. Cloudflare's binding is distributed infrastructure; no in-memory per-isolate counter is used.

Publishing remains disabled. This change does not deploy the Worker or modify production.
