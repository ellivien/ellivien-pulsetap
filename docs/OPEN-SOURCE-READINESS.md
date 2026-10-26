# PulseTap open-source readiness

This is the pre-release checklist for turning the reference implementation into
a genuinely provider-neutral, approachable open-source package. It records
product requirements only; it must not contain client names, prompts, keys,
site addresses or other private deployment details.

## Provider neutrality

- [ ] Extract the scheduled model call behind a small provider-adapter
  interface rather than shipping a fixed endpoint or model.
- [ ] Supply documented adapters for at least OpenAI-compatible Responses or
  Chat Completions APIs and Anthropic Messages.
- [ ] Keep companion names, relationship language, model IDs and provider
  credentials in user-controlled configuration.
- [ ] Test send, silence, malformed-output and provider-error paths against the
  shared decision contract.

## Private prompt handling

- [ ] Do not require a long companion prompt to fit inside a hosting dashboard's
  environment-variable form.
- [ ] Do not embed private prompts in `index.html`, repository files, deployment
  archives or public page source.
- [ ] Provide an authenticated in-portal prompt editor with a clearly explained
  storage model.
- [ ] Use one canonical server-side prompt record for the editor, ordinary chat
  and scheduled decisions. Do not make each feature or device maintain a separate
  copy.
- [ ] Define cross-device behaviour precisely: after a successful save, every
  later chat request and scheduled decision must read the new record; an editor
  already open elsewhere may require refresh or reopen, and concurrent edits need
  an explicit last-write or conflict policy.
- [ ] Keep standard Blob reads as the portable default. If a host requires
  immediate read-after-update behaviour, feature-detect and test a supported
  freshness strategy without assuming that an internal uncached endpoint exists.
  Document any propagation delay honestly.
- [ ] Make the prompt available to scheduled server-side decisions while the
  user's browser is closed. A browser-only `localStorage` prompt is insufficient
  for autonomous scheduled execution.
- [ ] Document deletion, replacement, access controls and the security trade-off
  between device-local and server-side prompt storage.
- [ ] Never log prompt contents or return them through a public configuration
  endpoint.
- [ ] Support a controlled migration from an existing environment-variable prompt
  to the server-side record without exposing either value or leaving users with a
  silent empty-prompt failure.

## No-local-tooling deployment

- [ ] Provide a supported cloud-build/Git deployment path for users who do not
  have Node.js, npm or a command-line workflow.
- [ ] Provide a separate Netlify CLI path for technical users.
- [ ] State prominently that an ordinary static drag-and-drop deployment is not
  equivalent to deploying scheduled functions with npm dependencies.
- [ ] Do not describe a static "precompiled folder" as sufficient unless the
  complete functions deployment has been tested through that exact route.
- [ ] Explain how to update an existing site without changing its origin, because
  browser-held conversations and settings are scoped to the site address.
- [ ] Include rollback and pre-deploy export instructions.

## First-run and secret setup

- [ ] Keep API keys, VAPID private keys and authentication secrets out of the
  repository and client bundle.
- [ ] Reduce dashboard configuration to short secret values that hosting forms
  can accept reliably.
- [ ] Explain VAPID key generation without recommending an untrusted online key
  generator.
- [ ] Validate missing configuration in the UI before scheduled decisions are
  enabled.

## Documentation and support boundary

- [ ] Keep one canonical installation route per deployment method so short and
  long guides cannot contradict one another.
- [ ] Test every published route from a clean account or isolated test site.
- [ ] Label the GitHub edition as a self-supported reference implementation.
- [ ] Distinguish the unsupported public edition from paid bespoke integration,
  branding, configuration, migration and support.
- [x] Ship an optional Ellivien PulseTap notification roundel, document the
  narrow permission to use it with PulseTap and explain how adopters can replace
  it with their own icon.

