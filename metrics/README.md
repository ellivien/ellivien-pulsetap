# Preserved GitHub metrics

After publication, the scheduled workflow writes timestamped aggregate GitHub
traffic snapshots into `snapshots/` every Sunday at 08:17 UTC.

These files intentionally contain no visitor identities, cookies, IP addresses
or PulseTap installation telemetry. See
[`docs/GITHUB-METRICS.md`](../docs/GITHUB-METRICS.md) for setup and
interpretation.
