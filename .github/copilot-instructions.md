# Fluent slide kit instructions

This repository creates fixed `1920x1080` HTML previews and native editable PowerPoint slides from a
shared renderer-neutral scene, plus structured SVG diagrams aligned with public Fluent 2 guidance.
It is not proof of Microsoft brand compliance. Use Microsoft logos, product launch icons, and
organization brand assets only when the user supplies an approved source and applicable terms.

## Interaction contract

- Assume users are business or executive stakeholders who interact only through natural language.
- Route slide, deck, presentation, architecture, workflow, review, and repair requests
	through the `fluent-presentation` skill.
- Never ask the user to run commands, edit JSON, HTML, or PowerPoint XML, select asset paths, or inspect validation reports.
- Ask only business questions that materially affect audience, outcome, evidence, or confidentiality.
- Run asset search, authoring, scene compilation, dual rendering, validation, screenshot capture, inspection, and repair
	autonomously with available tools.
- Hand off finished artifacts and business assumptions. Keep implementation details internal unless asked.

## Architecture

- Author decks as JSON under `decks/`, conforming to `schemas/deck.schema.json`.
- Select a profile under `design/brand-profiles/`; public output defaults to `fluent-aligned` and must
	not be described as Microsoft brand compliant.
- Author architecture and workflow graphs under `diagrams/`, conforming to `schemas/diagram.schema.json`.
- Set `diagramType: flow` when sequence and connectors carry the meaning. Set
	`diagramType: layered-architecture` when tiers, channels, capabilities, or cross-cutting concerns carry it.
- Choose only layouts listed in `templates/layouts.json`.
- Treat the selected brand profile, `design/design-contract.json`, and the compiled scene as source of truth.
- Compile one scene for both renderers. Never convert arbitrary HTML into PowerPoint.
- Generate standalone HTML with `npm run deck:render -- <deck.json>`; do not hand-edit generated slides.
- Generate native PowerPoint with `npm run deck:export:pptx -- <deck.json>`; do not package full-slide screenshots.
- Generate standalone SVG with `npm run diagram:render -- <diagram.json>`; do not hand-edit generated diagrams.
- `templates/slide-template.html` is an escape hatch for a one-off slide, not the default workflow.

## Required workflow

1. State one takeaway per slide and select a layout from the content shape.
2. Resolve every visual with `npm run assets:search -- "<concept>" --json`.
3. Add exact returned paths to the deck JSON. Never guess an asset filename or invent SVG geometry.
4. Run `npm run deck:build -- <deck.json> --preview` after every substantive deck change.
5. Inspect every HTML and available PowerPoint screenshot and repair hierarchy or composition issues.
6. Verify HTML and native PPTX validators pass; provide the editable `.pptx`, HTML, and previews.

For branching, merging, decisions, labeled connectors, boundaries, swim lanes, or cycles, use the
diagram schema and `fluent-diagram` skill. The `architecture` slide layout is a simple linear sequence;
the `diagram` layout embeds a validated flow or layered architecture.

## Content rules

- Titles use at most 10 words. Body copy uses at most 55 words per slide.
- Never invent metrics, dates, customer names, quotes, service capabilities, or citations. Use a bracketed placeholder.
- Add per-slide sources for factual claims. Use Microsoft Learn MCP for current Microsoft and Azure facts.
- Use sentence case. Keep paragraphs left-aligned in LTR languages and use CSS logical properties for RTL work.
- Store speaker notes and the slide takeaway in the deck JSON, not visible slide content.
- Keep sources, dates, slide numbers, and deck metadata out of the visual footer. Every slide renders only `Microsoft Confidential` at bottom left.

## Visual rules

- Preserve the fixed canvas, safe margins, type sizes, semantic colors, and 4px spacing system from `design/`.
- Use rounded corners for every visible container, card, boundary, lane, label chip, and diagram component; never introduce square-corner boxes or sharp-corner diamonds.
- Do not shrink body or caption text to make content fit; cut or split content instead.
- Keep embedded diagram labels at or above 18px effective size after slide scaling. Reject clipped text,
	overlapping items, crossing connectors, and layered architecture descriptions that depend on ellipsis.
- Use Regular Fluent icons for supporting concepts and Filled icons only for selected or emphasized states.
- Keep Azure service icons in original colors and proportions, with visible labels and useful alt text.
- Use AI-generated images only for hero photography, conceptual illustration, or editorial backgrounds.
	Never generate whole slides, logos, product icons, text, charts, architecture diagrams, or workflows as images.
- Use one restrained accent family. Semantic success, warning, and danger colors communicate meaning, not decoration.
- Default cards and components to a neutral subtle surface. Use a brand tint only for the focal item and semantic tints only when the tone communicates real status or meaning; never alternate colors merely to differentiate adjacent boxes.
- Avoid gradients, glass effects, decorative blobs, nested cards, emoji icons, text shadows, and center-aligned paragraphs.
- Slides are still frames: no autoplay, hover-dependent content, or required animation. Respect reduced motion.

## Quality gate

The deck, diagram, and PPTX validators must pass schema, semantic graph checks, brand policy, layout constraints, content
budgets, asset existence, font readiness, broken-image checks, canvas geometry, top-level overlap checks,
embedded SVG type and text bounds, diagram collisions and connector crossings, native named Office-object
coverage, speaker notes, and serious WCAG issues. A passing validator does not replace screenshot review.
Report the editable PowerPoint first, then HTML/previews, brand status, takeaway per slide, editability
exceptions, and unresolved placeholders.
