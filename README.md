# Fluent Slide Kit

A compact toolkit for creating executive-ready fixed `1920x1080` HTML scenes and lossless
`3840x2160` PNG deliverables with public Fluent 2 design guidance, local Fluent UI System Icons, and official Azure service
icons. GitHub Copilot authors freeform composition JSON; the kit resolves tokens into one renderer-neutral scene,
renders and validates offline HTML, and captures presentation-ready 4K PNGs.

An optional PowerPoint compatibility exporter remains available to maintainers, but it is not part of the default
delivery workflow or an editability promise. Users can insert the lossless 4K PNGs directly into PowerPoint.

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
- **Format:** one slide or deck; lossless 4K PNG is the primary portable deliverable and HTML preserves the vector scene

Examples:

> Create one executive slide explaining Azure Advisor architecture. The audience is cloud leaders,
> and the takeaway is how signals become prioritized, governed actions.

> Build a five-slide board-ready presentation comparing our two Azure migration options. Use the
> attached evidence, flag unsupported claims, and give me the 4K PNGs and HTML scenes.

> Review the latest presentation, fix content and visual issues, and return the revised deck.

The `fluent-presentation` skill automatically interprets the brief, asks only essential business
questions, researches current Microsoft facts, chooses visuals, authors architecture directly with
structured scene primitives, creates a structured flow only when branching semantics require it, renders
the slides, runs quality checks, visually reviews and repairs screenshots, and returns validated HTML
pages with lossless 4K PNG deliverables.

The handoff leads with the 4K PNGs, then the standalone HTML scenes. Technical semantic sources,
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
| `tools/render-scene-pptx.mjs` | Optional scene-to-PowerPoint compatibility renderer |
| `tools/build-deck.mjs` | End-to-end HTML/4K-PNG build and delivery manifest |
| `tools/validate-deck.mjs` | Schema, content, browser, geometry, asset, and axe checks |
| `tools/validate-pptx.mjs` | Optional compatibility-export structure checker |
| `tools/render-diagram.mjs` | Deterministic graph-to-standalone-SVG renderer |
| `tools/validate-diagram.mjs` | Graph semantics, browser, geometry, asset, and axe checks |
| `examples/deck.json` | Versioned reusable freeform composition with Fluent and Azure visuals |
| `examples/static-patterns.json` | Six validated structured patterns: status, owner, progress, table, tags, and KPI |
| `diagrams/templates/flow.json` | Versioned reusable branching-flow template |
| `.github/skills/fluent-presentation/SKILL.md` | Executive-facing natural-language orchestration workflow |
| `.github/skills/fluent-deck/SKILL.md` | Hidden internal deck implementation playbook |
| `.github/skills/fluent-diagram/SKILL.md` | Hidden internal diagram implementation playbook |
| `assets/manifest.json` | Entry point for the local icon collections |
| `assets/external-icons/catalog.json` | Approved non-Azure, non-Fluent vendor icons with pinned source and license metadata |
| `legal/provenance.json` | Asset/tool versions, licenses, terms, and brand boundary |
| `docs/native-powerpoint-architecture.md` | Optional PowerPoint compatibility-export design and limitations |

Final handoff bundles are written to `deliverables/<deck-name>/`, separate from intermediate validation
and preview material under `.slide-artifacts/`. General temporary helpers and command captures belong under
`.tmp/<task>/`. These directories are Git-ignored. Request-specific composition sources under `decks/` and
top-level `diagrams/` are local-only; reusable fixtures under `examples/` and `diagrams/templates/` remain versioned.

Generated HTML remains offline and preserves vector text, shapes, connectors, icons, and diagrams. The default
delivery PNG is captured losslessly at `3840x2160` and is suitable for insertion into PowerPoint. Optional PowerPoint
exports may mix editable primitives with flattened diagram graphics and are not part of the default quality contract.

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
  boundaries, and cards remain scalable renderer geometry.
4. When graph semantics require it, copy a fixture from `diagrams/templates/`, author and validate
  `diagrams/<name>.json`, then embed it as a positioned `diagram` element. Request diagrams are Git-ignored.
5. Add sources for factual claims and bracketed placeholders for missing evidence.
6. Run the HTML/PNG build and inspect every 4K PNG, even when checks pass.
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

# Individual HTML quality gate
npm run deck:validate -- decks/decision-deck.json

# Complete validated HTML and lossless 4K PNG deliverable bundle
npm run deck:build -- decks/decision-deck.json

# Optional PowerPoint compatibility export; editability varies by slide content
npm run deck:export:pptx -- decks/decision-deck.json
npm run deck:validate:pptx -- .slide-artifacts/pptx/decision-deck.pptx --deck decks/decision-deck.json

# Repository hygiene
npm run repo:check

# Tooling regression tests
npm test
```

VS Code associates JSON files under `decks/` and `examples/` with the composition schema, providing
completion and inline errors while the AI or a human edits them.

## Diagram workflow

Use structured text, shape, image, and line elements for architecture, system context, capability views,
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
The renderer applies a shared target clearance so arrowheads stop visibly before card boundaries in HTML and the captured PNG.

For common executive content, use `examples/static-patterns.json` as the anatomy reference. It contains
structured still-frame examples for a status message, owner/persona view, determinate progress and
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
- A lossless `3840x2160` PNG for every `1920x1080` logical slide
- Delivery-manifest entries that map every slide to its standalone HTML and PNG

Screenshot review remains mandatory because automated checks cannot judge narrative quality,
visual hierarchy, misleading diagrams, or whether the selected image supports the message.

## HTML, PNG, and scene delivery

Composition JSON is the authoring source and `deck.scene.json` is the resolved geometry used by the HTML renderer.
Standalone HTML preserves vector text, shapes, connectors, icons, and diagrams for inspection and reuse. The browser
validator captures every slide as a lossless `3840x2160` PNG and rejects any output with different dimensions.
Source PNG/JPEG assets are embedded without downsampling in the HTML scene.

The optional PowerPoint exporter is retained for compatibility testing. It is outside the default build because
complex diagrams become single graphics and practical editability varies by slide.

## Roadmap status

Implemented:

- freeform composition and optional structured diagram sources;
- renderer-neutral scene compilation with stable element ids;
- scene-driven offline HTML rendering and lossless 4K PNG capture;
- structured text, shape, line, image, and unrestricted freeform architecture elements;
- vector structured-flow rendering in standalone HTML;
- brand-profile schema and explicit `aligned-not-certified` status;
- HTML, accessibility, geometry, asset, and PNG-dimension validation;
- generated-image policy and safe local asset formats;
- static-only output contract and six structured executive patterns;
- optional PowerPoint compatibility export with stable Selection Pane names.

Deliberately separate future phases:

- an optional approved image-generation provider.

## Copilot workflows

- `fluent-presentation` is the only executive-facing skill. It owns the complete natural-language
  request through researched content, diagrams, shared scene, HTML validation, visual repair, and lossless 4K PNG delivery.
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

The optional `pptxgenjs` compatibility exporter depends on `image-size`, whose audit advisory concerns untrusted
ICNS/JXL/HEIF inputs. The kit accepts schema-constrained local SVG/PNG/JPEG assets and never permits those formats,
so that parser path is outside the input contract. Do not weaken this restriction or run `npm audit fix --force`.
