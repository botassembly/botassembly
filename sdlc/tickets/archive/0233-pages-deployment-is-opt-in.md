---
flow: build
priority: 1
---
# Pages deployment is opt-in

## Outcome

Documentation builds on every required run. Deployment runs only when the repository variable `PUBLISH_PAGES` equals `true`.

## Current facts

The first documentation run built and uploaded the site, then failed because Pages is not enabled. The deploy job holds Pages and identity-token write permissions.

## Scope

Gate the deploy job. Keep the build required and keep privileged permissions inside the deploy job. Do not enable Pages or publish the site.

## Acceptance

The workflow policy proves the exact gate, permissions, build, and deployment shape. Local documentation checks pass. The hosted build passes with deployment skipped when the variable is absent.

## Dependencies

None.

## Risk facts

This changes a privileged outward-facing workflow. A wrong condition could publish unexpectedly or hide a broken documentation build.

## Complexity

- Contract score: 1
- State and timing score: 1
- Reach score: 1
- Proof score: 1
- Cost of error score: 2
- Total: 6
- Minimum level floor: level 4 for privileged publication security
- Final level: 4
- Reasons: The required build and opt-in deployment form one public workflow contract. Hosted jobs run in order. A wrong condition could publish with Pages and identity-token write authority.
- Selected model: `gpt-5.6-sol` with medium reasoning

## Review

- Design review: accepted; the build remains unconditional and the deploy gate compares exactly with `true`
- Code review: accepted; the exact job-level gate preserves unconditional build work and deploy-only authority
