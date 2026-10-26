# PulseTap v0.1 release scope

PulseTap v0.1 is a self-supported Netlify reference implementation, not a
provider-neutral hosted service or universal folder. Its release gate concerns
whether the supplied reference is coherent, private, secure and adaptable.

## Included scope

- Netlify Functions and Netlify Blobs persistence.
- Standards-based Web Push with bounded push-service endpoint validation.
- An OpenAI-compatible Chat Completions decision example.
- Opt-in settings, quiet hours, daily and minimum-gap limits.
- Recent-chat pause, inspectable decision state and an inbox.
- Browser and service-worker integration guidance.
- Optional relationship-mode examples and PulseTap artwork.
- A self-support boundary directing adopters to their own coding AI or developer.

Other providers, hosting platforms and authentication systems require deliberate
adaptation. A private in-portal base-prompt editor, additional provider adapters
and deployment automation may be added in later versions; they are not claimed
as v0.1 features.

## Publication gate

- [ ] Syntax and behavioural tests pass from a clean checkout.
- [ ] Runtime dependencies install from the committed lockfile.
- [ ] A clean-room adopter can follow the AI guide without private knowledge.
- [ ] Scheduled invocation, authentication, push destinations and secret handling
      match the documented boundaries.
- [ ] The release ZIP contains the tests and scripts named by `package.json`.
- [ ] The ZIP checksum verifies and no private or forbidden files are present.
- [ ] The owner has reviewed and explicitly approved publication.

Do not make the repository public or create a release until every applicable
item above passes.
