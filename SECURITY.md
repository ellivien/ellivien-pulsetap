# Security policy

Do not report credentials, live push subscriptions, session tokens or private
conversation content in a public issue.

PulseTap is a reference implementation. Deployers must provide a suitable
authentication boundary, protect environment variables, restrict access to
stored context and keep dependencies updated.

The scheduled decision handler must remain configured as a Netlify Scheduled
Function. Netlify documents that deployed Scheduled Functions cannot be called
directly by URL; the handler additionally validates the scheduler's `next_run`
payload. Do not convert it into an ordinary public endpoint without adding a
separate authenticated invocation design.

Push subscription endpoints are restricted to common browser push-service
hosts. If a legitimate service uses another host, add only that hostname through
`PULSETAP_PUSH_HOSTS`. Do not use this setting to allow arbitrary destinations.

Use GitHub's private vulnerability-reporting route for this repository. Do not
include credentials, live subscriptions or conversation content in the report.

