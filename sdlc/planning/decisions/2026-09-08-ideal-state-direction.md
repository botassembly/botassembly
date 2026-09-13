# Describe the runtime on its own terms

Date: 2026-09-08. Status: direction. Owner: Ian Maurer, recorded by Codex.

## Decision

Botassembly's ideal-state document describes its specification, runtime, assembly files, execution, intelligence resolution, hooks, gates, delegated procedures, portability, and records. It does not describe the architecture or workflow of a particular consumer. A reader should understand the product without first learning the systems built on it.

The [planning alignment decision](2026-09-08-planning-alignment.md) applies Ian's concise bullets and prioritized gaps convention. The [current plan](../plan.md) runs the 0201 model comparison immediately after 0200. It schedules the other model experiments after known repairs.

## Options and accepted costs

The options were to explain the surrounding platform in the runtime document or keep the runtime document self-contained. Ian explicitly selected the self-contained document after the earlier explanation confused his mental model. The accepted cost is that consumers document their own integration. The earlier account remains in Git history and does not control the current ideal-state document.

Keep model names replaceable through complete intelligence mappings. The assembly author supplies stage purpose and the selected mapping name. Bot resolves and executes it. The cost is that authors must evaluate their own procedure quality; runtime conformance cannot establish the truth of a domain answer.

Evaluate scoped subflows through bounded tasks and whole-run consumption. Count parent validation, child failures, and repair work. The cost is slower adoption of delegation and explicit evidence collection. No new runtime behavior, file grammar, mapping, or configuration is introduced by this decision.

The early 0201 comparison delays some known repairs and temporarily freezes main. It gives evidence before the remaining work receives model assignments.

## Evidence and checks

The specification at inspected baseline `cf83433c` defines assemblies, flows, stages, scoped skills, subflows, hooks, gates, records, and named intelligence mappings. The ideal-state correction retains those mechanisms and removes consumer-specific examples and integration claims. A text scan confirms that the revised runtime ideal-state document contains no named higher-layer products or software-development workflow terms. No runtime test or model experiment was needed for this document-only correction.
