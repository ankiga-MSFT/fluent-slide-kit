# Fluent Slide Kit

A compact toolkit for creating executive-ready, editable PowerPoint decks and fixed `1920x1080` HTML
scenes with 2x `3840x2160` previews, public Fluent 2 design guidance, local Fluent UI System Icons, and official Azure service
icons. GitHub Copilot authors freeform composition JSON; the kit resolves tokens into one renderer-neutral scene,
renders HTML and native Office objects, validates both, and delivers `.pptx`, HTML, and 4K PNG previews.

This project produces **Fluent-aligned** output. It does not certify Microsoft brand compliance.
Microsoft logos, product launch icons, and organization-specific templates require an approved
brand source and their own usage terms.

## Executive quick start

Open this folder in VS Code, select **Agent** mode in Copilot Chat, and describe the result you need.
No terminal, JSON, HTML editing, asset selection, or manual screenshot work is required.

A useful brief can be one sentence. Include any details you know; the rest have safe defaults:

- **Topic:** what the presentation should explain
- **Audience:** who will see it
- **Outcome:** what they should understand, decide, or do
- **Evidence:** documents, facts, or organizational context to use
- **Format:** one slide or deck; editable PowerPoint is the primary deliverable and HTML is the QA preview

Examples:

> Create one executive slide explaining Azure Advisor architecture. The audience is cloud leaders,
> and the takeaway is how signals become prioritized, governed actions.

> Build a five-slide board-ready presentation comparing our two Azure migration options. Use the
> attached evidence, flag unsupported claims, and give me the editable PowerPoint and previews.

> Review the latest presentation, fix content and visual issues, and return the revised deck.

The `fluent-presentation` skill automatically interprets the brief, asks only essential business
questions, researches current Microsoft facts, chooses visuals, authors architecture directly with
native slide primitives, creates a structured flow only when branching semantics require it, renders
the slides, runs quality checks, visually reviews and repairs screenshots, and returns an editable
`.pptx`, validated HTML pages, and automatically generated 4K PNG previews.

The handoff leads with the editable PowerPoint, then preview images and HTML. Technical semantic sources,
the compiled scene, and validation reports remain available for reproducibility but require no executive input.

## Architecture

| Path | Purpose |
|---|---|
| `schemas/composition.schema.json` | Machine-enforced freeform composition contract |
| `schemas/diagram.schema.json` | Machine-enforced branching-flow contract |
| `schemas/scene.schema.json` | Renderer-neutral positioned element contract |
| `schemas/brand-profile.schema.json` | Fonts, colors, brand status, and asset-policy contract |
| `design/design-contract.json` | Canvas, static-only output policy, type aliases, content budgets, and guidance sources |
| `design/brand-profiles/fluent-aligned.json` | Public profile; aligned, not Microsoft brand-certified |
| `design/fluent-foundation.json` | Attributed renderer-neutral Fluent spacing, shape, type, brand-ramp, and shadow data |
| `design/fluent-chart-foundation.json` | Attributed Fluent qualitative and semantic chart palette plus static chart rules |
| `tools/search-assets.mjs` | Ranked local Fluent and Azure asset discovery |
| `tools/composition-core.mjs` | Token-resolved composition-to-scene compiler |
| `tools/render-deck.mjs` | Scene-driven standalone HTML entry point |
| `tools/render-scene-pptx.mjs` | Scene-to-native-Office renderer |
| `tools/build-deck.mjs` | End-to-end HTML/PPTX build and delivery manifest |
| `tools/validate-deck.mjs` | Schema, content, browser, geometry, asset, and axe checks |
| `tools/validate-pptx.mjs` | Open XML editability, scene coverage, notes, and optional Office preview checks |
| `tools/render-diagram.mjs` | Deterministic graph-to-standalone-SVG renderer |
| `tools/validate-diagram.mjs` | Graph semantics, browser, geometry, asset, and axe checks |
| `examples/deck.json` | Versioned reusable freeform composition with Fluent and Azure visuals |
| `examples/static-patterns.json` | Six validated native patterns: status, owner, progress, table, tags, and KPI |
| `diagrams/templates/flow.json` | Versioned reusable branching-flow template |
| `.github/skills/fluent-presentation/SKILL.md` | Executive-facing natural-language orchestration workflow |
| `.github/skills/fluent-deck/SKILL.md` | Hidden internal deck implementation playbook |
| `.github/skills/fluent-diagram/SKILL.md` | Hidden internal diagram implementation playbook |
| `assets/manifest.json` | Entry point for the local icon collections |
| `assets/external-icons/catalog.json` | Approved non-Azure, non-Fluent vendor icons with pinned source and license metadata |
| `legal/provenance.json` | Asset/tool versions, licenses, terms, and brand boundary |
| `docs/native-powerpoint-architecture.md` | Shared-scene, native editability, validation, and add-in design |

Final handoff bundles are written to `deliverables/<deck-name>/`, separate from intermediate validation
and preview material under `.slide-artifacts/`. General temporary helpers and command captures belong under
`.tmp/<task>/`. These directories are Git-ignored. Request-specific composition sources under `decks/` and
top-level `diagrams/` are local-only; reusable fixtures under `examples/` and `diagrams/templates/` remain versioned.

Generated HTML remains offline. PowerPoint uses native text, shapes, lines, and individual image objects.
Architectures are fully native because they are authored directly in the freeform composition. Complex
flow diagrams are browser-rasterized validated graphics until a native flow connector renderer is added;
the delivery manifest discloses this per slide.

Every slide is a static still frame. The kit excludes animations, slide transitions, autoplay,
hover-dependent disclosure, interactive controls, loading states, and motion-dependent meaning.

## Automated authoring workflow

The `fluent-presentation` skill performs this workflow. These are implementation stages, not steps the
requestor must execute.

1. Create local `decks/<name>.json` from `examples/deck.json`; request sources under `decks/` are Git-ignored.
2. Give every slide one takeaway and compose its complete static visual argument directly from positioned primitives.
3. Inventory every visual role, search each concept locally, and copy exact catalog paths for suitable
  pictograms or symbols. Resolve non-Azure/non-Fluent product icons from `assets/external-icons/`; new entries
  require an official pinned source, license file, and trademark notice. Structural connectors, dash patterns,
  boundaries, and cards remain native editable geometry.
4. When graph semantics require it, copy a fixture from `diagrams/templates/`, author and validate
  `diagrams/<name>.json`, then embed it as a positioned `diagram` element. Request diagrams are Git-ignored.
5. Add sources for factual claims and bracketed placeholders for missing evidence.
6. Run the dual-format build and inspect HTML and PowerPoint screenshots, even when checks pass.
7. Repair the composition first; change shared renderers only for system-level defects.

### Repository hygiene

Put every disposable helper script, probe, download, extraction, log, cache, or command capture under
`.tmp/<task>/`. Presentation-specific intermediate work belongs under `.slide-artifacts/<deck-name>/tmp/`.
Operating-system temporary directories remain appropriate for isolated tests. Never place temporary files
in the repository root or a source-controlled directory. The workspace Stop hook and `npm run repo:check`
reject common temporary artifact patterns that escape these approved scratch locations.
Every validated `deck:build` also runs the repository hygiene checker after writing its deliverables, so
temporary archives, extraction directories, probes, and command captures cannot survive a successful handoff.

### Maintainer commands

The CLI remains available for maintainers, CI, and debugging. Executives should use natural language
through the skill instead.

```powershell
# Search assets
npm run assets:search -- "growth trend" --collection fluent --style regular
npm run assets:search -- "Azure Cosmos DB" --collection azure --json

# Render or validate a branching workflow graph
npm run diagram:render -- diagrams/templates/flow.json
npm run diagram:validate -- diagrams/templates/flow.json

# Render without browser validation
npm run deck:render -- decks/decision-deck.json --output slides

# Compile the renderer-neutral scene
npm run deck:compile -- decks/decision-deck.json

# Individual quality gates and native export
npm run deck:validate -- decks/decision-deck.json
npm run deck:export:pptx -- decks/decision-deck.json
npm run deck:validate:pptx -- .slide-artifacts/pptx/decision-deck.pptx --deck decks/decision-deck.json

# Complete validated deliverable bundle; Office preview is optional
npm run deck:build -- decks/decision-deck.json --preview

# Repository hygiene
npm run repo:check

# Tooling regression tests
npm test
```

VS Code associates JSON files under `decks/` and `examples/` with the composition schema, providing
completion and inline errors while the AI or a human edits them.

## Diagram workflow

Use native text, shape, image, and line elements for architecture, system context, capability views,
deployment views, reference-image reconstruction, and short sequences. Use `diagramType: flow` only when
branching, decisions, merging, cycles, lanes, or labeled edge semantics carry the message.

Diagram sources remain editable JSON. The renderer supports Azure service, process, decision,
data-store, queue, actor, and external-system flow nodes. The deterministic renderer has no additional
runtime dependency. Generated SVG is a handoff artifact and must not be edited manually.

The diagram validator checks schema, globally unique ids, endpoint and container references, asset
paths, decision labels, empty groups and lanes, disconnected nodes, accidental cycles, SVG asset
embedding, fixed `1600x720` geometry, effective type size, text containment, item collisions, connector
crossings, serious accessibility issues, and a deterministic screenshot. Flows are limited to 18 nodes;
freeform architecture density is judged through content budgets, geometry validation, and screenshot review.

## Composition model

Each slide is a fixed `1920x1080` canvas authored directly with `text`, `shape`, `line`, `image`, and
optional `diagram` elements. Every element has a stable id, explicit z-order, and exact geometry.
Logical groups distinguish intended internal overlap from accidental collisions. Brand-profile tokens
resolve colors and fonts during compilation without dictating composition.

The schema constrains valid primitives and provenance, not storytelling templates. Openings, statements,
comparisons, paths, evidence views, and architecture slides are compositions rather than named layouts.
Adding another slide is preferable to shrinking typography or overloading one frame.

Readability takes priority over density. The validator enforces minimum rendered content padding inside the
smallest containing card. Screenshot review must also compare dense and unused regions, redistribute available
canvas before shrinking content, and keep repeated peer cards consistent in dimensions and padding.
Centered focal cards declare `metadata.contentAlignment: center`; their grouped heading and supporting text
must both use center alignment and share the container's horizontal centerline.

Neutral cards, components, and boxes default to `$surface`, which is white in the light theme. Non-white
fills are reserved for explicit user direction or documented focal or semantic meaning. Ordinary directional
arrows share the flow-diagram primary connector treatment: `$secondary`, 2.5px, with a filled triangle.
The renderer applies a shared target clearance so arrowheads stop visibly before card boundaries in both HTML and PowerPoint.

For common executive content, use `examples/static-patterns.json` as the anatomy reference. It contains
native, editable still-frame examples for a status message, owner/persona view, determinate progress and
milestones, structured table, metadata/status tags, and sourced KPI summary. These are compositions to
adapt, not fixed layouts or interactive component simulations.

Slide aliases are larger than Fluent’s application UI type ramp for projected readability:
72px display, 48px title, 30px subtitle, 24px body, and 18px caption. The stack uses Segoe when
installed and falls back to native system fonts. No Segoe font binary is redistributed.

## Validation

The quality gate checks:

- Composition schema, primitive requirements, and stable ids
- Title and body content budgets
- Asset containment and file existence
- Required Azure/image alt text and visible Azure labels
- Referenced diagram schema, topology, asset, and semantic checks
- Font readiness and broken images
- Canvas overflow, clipped content, and group-aware element overlap
- Embedded diagram viewBox, effective 18px minimum type, text containment, collisions, and crossings
- Serious WCAG 2.0/2.1 A and AA violations through axe-core
- A deterministic 2x `3840x2160` screenshot for every `1920x1080` logical slide
- Native Office objects with stable scene-derived names rather than full-slide screenshots
- Speaker notes and per-slide scene identity in the PowerPoint package
- Expected PowerPoint slide and scene-element coverage
- Optional desktop PowerPoint rendering at `3840x2160`, including a nonblank pixel check

Screenshot review remains mandatory because automated checks cannot judge narrative quality,
visual hierarchy, misleading diagrams, or whether the selected image supports the message.

## PowerPoint, HTML, and scene delivery

Composition JSON is the authoring source and `deck.scene.json` is the resolved geometry shared by both renderers.
PowerPoint is the primary executive artifact: text, cards, and freeform architecture remain editable.
HTML is the rapid deterministic QA surface. The validators capture both browser and,
when desktop Office is available and no interactive session is open, PowerPoint-rendered previews.
Native geometry and SVG media remain resolution-independent, source PNG/JPEG assets are not downsampled,
and the validated graphic fallback for a complex flow is rendered at `3200x1440`.

PowerPoint light edits are expected, but regeneration remains source-driven; arbitrary Office edits are
not reverse-engineered into deck JSON. Stable Selection Pane names (`fluent-slide-kit:<slide>:<element>`)
provide the identity contract for a future PowerPoint task-pane revision experience.

Desktop preview automation refuses to run while an interactive PowerPoint session exists, preventing the
validator from closing or interrupting user work. Structural validation still runs without Office.

## Roadmap status

Implemented:

- freeform composition and optional structured diagram sources;
- renderer-neutral scene compilation with stable element ids;
- scene-driven HTML and native editable PowerPoint renderers;
- native text, shape, line, image, and unrestricted freeform architecture objects;
- validated graphic fallback for complex flow diagrams;
- brand-profile schema and explicit `aligned-not-certified` status;
- HTML, Open XML, speaker-note, Office-preview, and pixel validation;
- generated-image policy and safe local asset formats;
- static-only output contract and six native executive patterns;
- stable Selection Pane names for future AI revisions.

Deliberately separate future phases:

- importing arbitrary approved `.potx` masters without losing proprietary template metadata;
- native-shape rendering for complex flow diagrams;
- a PowerPoint task-pane add-in and authenticated AI revision service;
- an optional approved image-generation provider.

The add-in cannot be production-ready without choosing an identity model, AI backend, data-retention
policy, and deployment boundary. The stable object-name and semantic-source contracts required by that
phase are already present; see `docs/native-powerpoint-architecture.md`.

## Copilot workflows

- `fluent-presentation` is the only executive-facing skill. It owns the complete natural-language
  request through researched content, diagrams, shared scene, editable PowerPoint, HTML, validation,
  visual repair, and previews.
- `fluent-deck` and `fluent-diagram` are hidden internal playbooks loaded by the presentation skill.
- Prompt shortcuts are intentionally omitted so users do not need to choose between technical workflows.

## MCP profile

`.vscode/mcp.json` enables only two focused servers:

- **Microsoft Learn MCP** at `https://learn.microsoft.com/api/mcp` for current public Microsoft
  documentation, service names, and source URLs. It is remote, free, and requires no authentication.
- **Playwright MCP 0.0.79** in isolated headless Edge for optional interactive browser review.

Local assets use the token-efficient CLI rather than filesystem or GitHub MCP. The deterministic
validator uses the pinned local Playwright dependency and is the authoritative quality gate.

Azure MCP should be added only when a deck must read actual subscription inventory or metrics,
using least-privilege read-only RBAC. M365/WorkIQ or Microsoft Graph integration should be added
only for approved organizational content. Figma MCP is useful only when an approved Figma library
is the design source of truth.

## Assets and terms

- Fluent UI System Icons: MIT, version `1.1.335`; compact Regular/Filled canonical SVGs.
- Azure Public Service Icons: V24; original category hierarchy, FAQ, and terms included.
- Approved external icons: official vendor-owned SVGs pinned by revision under `assets/external-icons/`, with per-entry license and trademark metadata.
- Azure artwork is not recolored, distorted, shadowed, or used to imply endorsement.
- Microsoft product launch icons, Microsoft logos, stock photography, and Fluent Emoji are not included.

AI-generated imagery is permitted only for hero photography, conceptual illustration, and editorial
backgrounds stored under `assets/generated/`. It is prohibited for whole slides, text, charts, logos,
Microsoft product icons, architecture diagrams, and workflows.

The kit is deliberately small. It does not include Fluent React, web components, native packages,
stock-photo archives, generic MCP servers, CDN dependencies, a graph-layout package, redistributable
Segoe binaries, or a bundled AI image service.

The two JSON foundation snapshots under `design/` are plain MIT-licensed source data, not runtime
dependencies. Their exact upstream package versions, revision, modifications, and notices are recorded
in `legal/provenance.json`. Referenced fonts and icons remain governed by their separate asset terms.

`pptxgenjs` depends on `image-size`, whose audit advisory concerns untrusted ICNS/JXL/HEIF parsers. The
kit accepts schema-constrained local SVG/PNG/JPEG assets and never permits those formats, so that vulnerable
parser path is outside the input contract. Do not weaken this restriction or run `npm audit fix --force`,
which currently proposes an unsafe downgrade of the PowerPoint renderer.
