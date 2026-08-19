# Fluent slide kit instructions

This repository creates fixed `1920x1080` HTML scenes and lossless `3840x2160` PNG deliverables from a shared
renderer-neutral scene, plus structured SVG diagrams aligned with public Fluent 2 guidance.
It is not proof of Microsoft brand compliance. Use Microsoft logos, product launch icons, and
organization brand assets only when the user supplies an approved source and applicable terms.

## Interaction contract

- Assume users are business or executive stakeholders who interact only through natural language.
- Route slide, deck, presentation, architecture, workflow, review, and repair requests
	through the `fluent-presentation` skill.
- Never ask the user to run commands, edit JSON or HTML, select asset paths, or inspect validation reports.
- Ask only business questions that materially affect audience, outcome, evidence, or confidentiality.
- Run asset search, authoring, scene compilation, dual rendering, validation, screenshot capture, inspection, and repair
	autonomously with available tools.
- Hand off finished artifacts and business assumptions. Keep implementation details internal unless asked.

## Repository hygiene

- Put every temporary helper script, probe, command capture, download, extracted file, log, cache, and other disposable artifact under `.tmp/<task>/`.
- Keep presentation-specific intermediate output under `.slide-artifacts/<deck-name>/`. Operating-system temporary directories are also acceptable for isolated test output.
- Never create temporary files in the repository root or a source-controlled directory. If a tool or subagent creates one, move it into an approved scratch directory or delete it before continuing.
- Keep `.tmp/` and `.slide-artifacts/` Git-ignored. Never commit temporary artifacts or add an ad hoc ignore rule that hides them elsewhere.
- Before handoff, run `npm run repo:check` and review Git status so only intentional source changes remain visible.

## Architecture

- Author freeform compositions as JSON under `decks/`, conforming to `schemas/composition.schema.json`.
- Treat JSON under `decks/` and top-level `diagrams/` as local request sources; they are Git-ignored. Only reusable fixtures under `examples/` and `diagrams/templates/` belong in version control.
- Select a profile under `design/brand-profiles/`; public output defaults to `fluent-aligned` and must
	not be described as Microsoft brand compliant.
- Compose slides directly from positioned text, shape, line, image, and optional flow-diagram elements. Use stable ids, semantic tokens, explicit z-order, and logical groups for intentionally overlapping elements.
- Author every architecture, capability view, system context, tier map, and reference-image reconstruction directly in the freeform composition. Use rounded shapes, text, connectors, Azure icons, and Fluent icons without imposing a fixed grid, rail, layer, or topology template.
- Author a structured `flow` graph under `diagrams/`, conforming to `schemas/diagram.schema.json`, only when branching, merging, decisions, lanes, cycles, or labeled edge semantics justify graph-specific validation.
- Treat the selected brand profile, `design/design-contract.json`, `assets/manifest.json`, and the compiled scene as source of truth.
- Compile one renderer-neutral scene, render standalone HTML, and capture its validated 4K PNG.
- Generate standalone HTML with `npm run deck:render -- <deck.json>`; do not hand-edit generated slides.
- Generate lossless PNGs at exactly `3840x2160`; fail delivery when any slide has different dimensions.
- Generate standalone SVG with `npm run diagram:render -- <diagram.json>`; do not hand-edit generated diagrams.
- Put final handoff bundles under `deliverables/<deck-name>/`. Reserve `.slide-artifacts/` for intermediate validation and previews.

## Required workflow

1. State one takeaway per slide and choose a visual argument that makes it immediately legible.
2. Compose architecture and simple sequences with direct primitives; opt into a structured flow only when graph semantics require it.
3. Create an internal component inventory for every visual role, including icons, arrows, line styles, boxes, cards, and boundaries. Run `npm run assets:search -- "<concept>" --json` for every item before selecting an implementation.
4. Author explicit geometry on the fixed canvas; never guess asset filenames or invent SVG geometry.
5. Run `npm run deck:build -- <deck.json>` after every substantive composition change.
6. Inspect every 4K PNG and repair hierarchy or composition issues.
7. Verify the HTML validator and PNG dimension checks pass; provide the lossless PNGs and standalone HTML.

For branching, merging, decisions, labeled connectors, boundaries, swim lanes, or cycles, use the
diagram schema and `fluent-diagram` skill. Embed the validated source as a `diagram` element within the
otherwise freeform composition. Keep simple sequences structured with shape, text, image, and line elements.

Use an exact Fluent or Azure catalog result whenever it is a semantically suitable pictogram or standalone
symbol. Catalog entries such as Arrow Right, Line Dashes, Square, and Card UI are glyphs, not stretchable
connectors or content containers; structural arrows, dashed paths, boundaries, boxes, and cards remain renderer
lines and rounded shapes styled by `design/design-contract.json`. If no suitable catalog visual exists,
search `assets/external-icons/catalog.json` for approved non-Azure, non-Fluent product or vendor icons. Add a new
external icon only from an official vendor-owned source pinned to an immutable revision, with its license and
trademark notice recorded in that catalog and `legal/provenance.json`; never use a third-party logo mirror.
Use a labeled scene primitive before inventing an icon. Any permitted generated-image fallback must record
`metadata.assetFallback.searchQueries` and `metadata.assetFallback.reason`.

## Content rules

- Titles use at most 10 words. Body copy uses at most 100 words per slide.
- Never invent metrics, dates, customer names, quotes, service capabilities, or citations. Use a bracketed placeholder.
- Add per-slide sources for factual claims. Use Microsoft Learn MCP for current Microsoft and Azure facts.
- Use sentence case. Keep paragraphs left-aligned in LTR languages and use CSS logical properties for RTL work.
- Store speaker notes and the slide takeaway in the deck JSON, not visible slide content.
- Keep sources, dates, slide numbers, and deck metadata out of the visual footer. Every slide renders only `Microsoft Confidential` at bottom left.

## Visual rules

- Preserve the fixed canvas, safe margins, type sizes, semantic colors, and 4px spacing system from `design/`.
- Use rounded corners for every visible container, card, boundary, lane, label chip, and diagram component; never introduce square-corner boxes or sharp-corner diamonds.
- Do not shrink body or caption text to make content fit; cut or split content instead.
- Readability outranks density. Before reducing type or padding, inspect the largest unused canvas regions,
	shrink low-information bands, and redistribute that space to cramped content. Repeated peer cards must use
	consistent dimensions and internal padding; no region may remain conspicuously empty while a peer region is compressed.
- Focal cards with centered composition declare `metadata.contentAlignment: center`; every grouped text box
	uses center alignment and shares the card's horizontal centerline. Never mix centered and left-aligned text
	inside the same focal card unless the user explicitly requests an asymmetric composition.
- Keep embedded flow labels at or above 18px effective size after slide scaling. Reject clipped text,
	overlapping items, crossing connectors, and labels that depend on ellipsis.
- Use Regular Fluent icons for supporting concepts and Filled icons only for selected or emphasized states.
- Keep Azure service icons in original colors and proportions, with visible labels and useful alt text.
- Use AI-generated images only for hero photography, conceptual illustration, or editorial backgrounds.
	Never generate whole slides, logos, product icons, text, charts, architecture diagrams, or workflows as images.
- Use one restrained accent family. Semantic success, warning, and danger colors communicate meaning, not decoration.
- Default every card, component, and other box to `$surface`, which resolves to white in the light theme. Neutral cards use the near-black `$stroke` outline with at least 3:1 contrast against their fill; use semantic border colors only when they carry meaning, and require documented `outlineIntent` for lower-contrast or borderless exceptions. Use a non-white fill only when the user explicitly requests it or documented focal or semantic intent requires it; never use `$subtle` or alternating fills merely to differentiate adjacent boxes.
- Use the primary flow connector treatment for ordinary directional arrows: `$secondary`, 2.5px, and a filled triangular arrowhead. Use a different color, weight, dash, or arrowhead only when the user requests it or the connector carries documented semantic meaning.
- Author connector endpoints at their semantic target boundary; the shared renderers apply the design-contract target clearance so filled arrowheads remain distinct from card borders rather than blending inside them.
- Structural boundaries render behind every connector that enters or crosses them; never let a filled boundary hide an arrow or path.
- Avoid gradients, glass effects, decorative blobs, nested cards, emoji icons, text shadows, and center-aligned paragraphs.
- Slides are still frames: no autoplay, hover-dependent content, or required animation. Respect reduced motion.

## Quality gate

The composition and diagram validators must pass schema, semantic graph checks, brand policy, content
budgets, asset existence, font readiness, broken-image checks, canvas geometry, top-level overlap checks,
embedded SVG type and text bounds, diagram collisions and connector crossings, exact 4K PNG dimensions,
and serious WCAG issues. A passing validator does not replace screenshot review.
Report the PNGs first, then HTML, brand status, takeaway per slide, and unresolved placeholders.
