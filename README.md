# Ellivien PulseTap

![PulseTap roundel](assets/pulsetap-icon-512.png)

PulseTap is an opt-in reference implementation that lets a personal AI
companion decide whether to send a private Web Push notification while its
portal is closed.

It is deliberately not a reminder scheduler. A scheduled opportunity asks the
companion whether it has a welcome, relevant reason to reach out. Silence is a
valid decision. User-controlled quiet hours, daily limits, minimum gaps and a
recent-conversation pause constrain every check.

## What is included

- Netlify Functions for configuration, context, subscriptions, state, inbox
  messages, test pushes and scheduled decisions
- Netlify Blobs persistence
- standards-based Web Push using VAPID
- service-worker handlers
- browser integration guidance
- a human-facing installation guide
- optional relationship and message-mode examples
- an optional Ellivien PulseTap notification icon
- visible decision state and an inbox so the process is inspectable

The supplied scheduled function uses an OpenAI-compatible Chat Completions
request as a portable example. Adapt the provider call if your portal uses a
different model service.

## Self-supported reference implementation

PulseTap is not a universal folder that can be uploaded unchanged to every
portal. Authentication, hosting, model providers, storage, service workers and
device notification rules differ. Use the repository as a working reference and
ask your own coding AI or developer to adapt it to your environment.

Expect to diagnose integration errors from your own build, function and browser
logs. Remove credentials, private prompts, conversation content and identifying
details before sharing logs with an AI or another person. Ellivien does not offer
individual installation or ongoing technical support for the public repository.

## Important properties

- Explicitly opt-in
- Silence is valid at every scheduled opportunity
- Quiet hours support half-hour boundaries
- Daily reach limits and minimum gaps
- Recent real conversation pauses model calls
- Failed push delivery does not erase a saved companion decision
- Expired Web Push subscriptions are removed after HTTP 404 or 410
- Notifications are saved to the inbox before delivery
- Full decision state remains visible to the user

## Start here

1. Read `docs/PulseTap-Guide.html` in a browser.
2. Read `docs/README-FOR-AI.md` when integrating with coding assistance.
3. Choose or adapt an example from `docs/relationship-mode-examples.md`.
4. Copy `.env.example` to your deployment environment and replace every
   placeholder. Never commit the real values.
5. Install the two runtime dependencies with `npm install`.
6. Merge the browser and service-worker examples into the host portal rather
   than replacing its existing authentication or application shell.
7. Copy `assets/pulsetap-icon-512.png` into the host portal's public assets or
   replace the path with a notification icon of your own.
8. Run `npm run check` before deployment.

The implementation is a reference integration, not a drop-in hosted service.
The person deploying it remains responsible for authentication, provider
terms, notification consent, data protection and deployment costs.

## Repository structure

```text
docs/                         Guides
assets/                       Optional PulseTap brand and notification artwork
netlify/functions/            Server-side reference implementation
netlify-toml-snippet.toml     Scheduled-function configuration
pulsetap-index-integration.md Browser integration
service-worker-pulsetap-snippet.js
```

## Privacy and safety

- Keep API keys, VAPID private keys and session secrets in deployment
  environment variables.
- Send only the recent context needed for the decision.
- Let users disable PulseTap and delete their push subscription.
- Do not use PulseTap for emergency, medical or safety-critical messages.
- Do not design decisions to manipulate guilt, obligation or dependency.
- Preserve an inspectable inbox and decision log so outreach is not covert.

## Project status

PulseTap is extracted from a working Ellivien implementation and is being
prepared for its first public release. Automated behavioural tests and
additional provider adapters are planned.

## Releases and transparent usage evidence

Use the versioned package on the GitHub **Releases** page when downloading
PulseTap. GitHub counts downloads of named release assets, while downloads of
the automatically generated source archives are not exposed as release-asset
download counts.

This repository is prepared to preserve GitHub's aggregate traffic evidence
twice each week because GitHub exposes repository views, visitors, clones,
referrers and popular pages for only the most recent 14 days. Snapshots contain
aggregate counts only. PulseTap does not add visitor tracking, analytics code or
telemetry to adopters' portals.

Repository maintainers should complete the one-time setup in
[`docs/GITHUB-METRICS.md`](docs/GITHUB-METRICS.md) before the first public
release.

## Licence

The software is licensed under the Apache License 2.0. The bundled PulseTap
roundel may be used unmodified as the notification icon for a PulseTap
implementation. It may be replaced with the adopter's own icon. This limited
permission does not grant permission to use the Ellivien name or other Ellivien
branding for unrelated products or imply endorsement by Ellivien.

