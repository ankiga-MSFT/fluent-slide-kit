---
name: fluent-presentation
description: "Create, revise, review, or export an executive-ready Microsoft or Azure presentation from a natural-language business brief. Use when an executive asks for a slide, deck, PowerPoint-ready visual, presentation, Azure architecture, process flow, recommendation, decision narrative, HTML scene, or executive summary. Own the complete workflow: clarify essential business intent, research current Microsoft facts, compose the visual argument, resolve assets, compile a shared scene, render and validate offline HTML plus lossless 4K PNGs, visually review, repair, and deliver without asking the user to run commands or edit files."
argument-hint: "Describe the audience, message or decision, evidence, and desired slide or deck"
---

# Fluent presentation concierge

## User experience contract

The user interacts only through natural language. Treat terminal commands, JSON, schemas, scene graphs,
asset paths, renderers, validators, and screenshot automation as internal details.

Never ask the user to:

- run a command or open a terminal;
- create, copy, or edit JSON, HTML, SVG, CSS, or asset paths;
- choose a schema, renderer, layout id, or validation option;
- inspect a raw validation report;
- manually create screenshots or convert HTML.

Run the complete workflow with available tools. If a tool fails, diagnose and repair it before
reporting a blocker. In the final handoff, lead with the finished 4K PNGs and HTML, not the
implementation process. Provide technical details only when the user asks for them.

This workflow requires Copilot Chat Agent mode so tools can run. If tool access is unavailable, ask
the user only to switch the chat to Agent mode; do not replace the automated workflow with terminal
instructions.

## 1. Understand the business request

Infer reasonable defaults from the request and conversation. Ask at most three concise business
questions only when the missing answer would materially change the output:

- Who is the audience?
- What decision, action, or understanding should the presentation create?
- Which supplied evidence or organizational context must be used?

Always confirm the title before authoring, in addition to those questions and even when the rest of the
request is clear. Propose one specific action title, then ask the user to approve or replace it in one
concise question. Default the visual theme to `light` without asking for confirmation, including when a
supplied visual reference uses a dark canvas. Use another theme only when the user explicitly requests it.
For a deck, confirm the deck title, use the resolved default theme, and let slide titles follow from each
slide's takeaway.

For an underspecified request, default to an executive audience, a concise explanatory narrative,
public Microsoft sources, 16:9 output, the `light` theme, and a single slide when the user says "a slide."
State important assumptions in the handoff.

Never invent metrics, customer facts, deployed resources, topology, dates, quotes, or capabilities.
Use explicit placeholders when private evidence is unavailable.

### Reference-image fidelity gate

When the user asks to convert or reconstruct an attached image, treat the image as the authoritative
content and semantic source. Before authoring, create an internal verbatim content inventory covering
every visible title, heading, label, caption, qualifier, legend item, and footnote. Also inventory the
source relationships: grouping, boundaries, connector direction, arrow labels, sequence, icon identity,
and any color that carries meaning.

Source content and relationships are immutable by default. Do not paraphrase, summarize, normalize
terminology, correct product language, add or remove labels, reorder steps, or substitute a new narrative
unless the user explicitly approves that exact deviation. A user-approved title or theme change overrides
only that item; it does not authorize other content changes. If source text is unreadable or ambiguous,
ask one targeted business question or mark the item as unresolved rather than guessing.

Standard content budgets must never cause silent omission or condensation of source-image content. Preserve
the source on one slide when a one-to-one conversion was requested. If exact content cannot remain legible
within the minimum type and geometry rules, obtain user approval before splitting the slide or changing copy.
Mark a one-to-one source slide with `sourceImageFidelity.verbatim: true` and record every approved deviation
in `sourceImageFidelity.approvedDeviations`; this declaration may exceed the standard body budget with a
validator warning, but never bypasses minimum type, clipping, overlap, accessibility, or screenshot review.

Before delivery, compare the authored composition and screenshot against the inventory. Every visible source
item and semantic relationship must be accounted for exactly, except for user-approved deviations recorded
in speaker notes. Do not declare a reference-image conversion complete based on schema or geometry validation
alone.

## 2. Route the work internally

Choose the workflow without asking the user:

- Narrative slide or deck: follow the internal [deck playbook](../fluent-deck/SKILL.md).
- Architecture, capability view, system context, or reference-image reconstruction: always compose directly
  with structured text, rounded shapes, icons, and connectors on the freeform slide canvas. Preserve the visual
  argument instead of translating it into a generic structural artifact.
- Branching workflow: follow the internal [diagram playbook](../fluent-diagram/SKILL.md) only when merging,
  decisions, labeled branches, boundaries, swim lanes, or cycles need semantic graph validation.
- Mixed request: create and validate only the semantically complex flow, then place it inside the otherwise
  freeform scene composition.
- Existing artifact review or repair: reproduce the issue, repair the owning source, revalidate, and
  return the revised deliverable.

The structured diagram workflow supports `flow` only. Never use it for architecture merely because the
content has tiers, channels, capabilities, governance, or many components.

## 3. Ground content and visuals

Use Microsoft Learn MCP for current public Microsoft and Azure terminology, behavior, and source URLs.
If the user asks about actual deployed resources or recommendations, use an appropriate read-only Azure
skill or tool and confirm only the required business scope. Do not imply that a conceptual diagram is
Microsoft's private implementation architecture or the user's deployed topology.

Before authoring, load `assets/manifest.json`, `design/design-contract.json`, the selected brand profile,
`design/fluent-foundation.json`, and `design/fluent-chart-foundation.json`. The brand profile remains the
renderer-facing color and typography contract; the foundation snapshots are attributed authoring references
for spacing, shape, hierarchy, shadows, and static data-visualization semantics.

Search the local catalogs under `assets/` yourself for every visual by running `npm run assets:search`.
Use exact returned paths and never guess an asset filename. Preserve official Azure icon colors and
proportions. If an official product icon is unavailable, use a clearly conceptual Fluent icon or labeled
process node; never counterfeit an Azure service icon.

Resolve non-Azure, non-Fluent product or vendor icons through `assets/external-icons/catalog.json` with
`npm run assets:search -- "<product>" --collection external --json`. If absent, add the asset under
`assets/external-icons/` only from an official vendor-owned source pinned to an immutable revision. Record
the source, revision, license file, and trademark notice in its catalog entry and `legal/provenance.json`.
Use `assetKind: external` and `provenance: external-catalog`. Never use a third-party logo mirror or an
untracked web URL, and never modify official product artwork.

Before composing, create an internal visual component inventory. Include every product/service icon,
concept pictogram, action or state symbol, arrow, solid/dashed/dotted path, boundary, square/rectangle,
card, and panel. Run the local asset search for every inventory item and retain the query, leading matches,
selection, and rejection reason internally.

Use the exact catalog asset when a match is semantically suitable as a standalone visual. For example, a
requested thinking symbol resolves to `assets/fluent-system-icons/svg/regular/thinking.svg`; do not silently
substitute a brain or sparkle icon. A lexical match is not sufficient when its metaphor is wrong.

Treat structural geometry separately after the same search. Fluent entries such as Arrow Right, Line Dashes,
Square, Rectangle Landscape, and Card UI are fixed icon glyphs; they do not replace stretchable connectors,
dash patterns, boundaries, or structured content cards. Implement those roles with `line` and rounded
`shape` primitives using the shared Fluent-aligned tokens. This is the required structural implementation,
not an asset fallback.

Use another SVG or generated visual only when the Azure, Fluent, and approved external searches find no suitable local catalog asset and policy
allows that visual type. Prefer a labeled scene primitive over an invented icon. Any permitted generated
fallback must record `metadata.assetFallback.searchQueries` and `metadata.assetFallback.reason`.

Use image generation only for hero photography, conceptual illustration, or an editorial background.
Never generate a whole slide, logo, Microsoft product icon, slide text, chart, architecture diagram, or
workflow as an image. Keep narrative text, data, and diagrams as structured content.

Every presentation is a static still-frame experience. Do not author animations, slide transitions,
autoplay, hover-dependent content, interactive controls, loading states, or motion-dependent meaning.
Motion tokens in the foundation snapshot are provenance-only and must not be applied to generated output.

## 4. Author the internal sources

Create local request source files under `decks/` and, when needed, `diagrams/`. They are reproducible
inputs for the current request but are intentionally ignored by Git; only reusable examples under
`examples/` and `diagrams/templates/` are versioned. Choose concise names derived from the topic. Keep
one takeaway per slide, make titles communicate claims, and add speaker notes and
sources. Prefer another slide over shrinking text or overloading one frame.

For a single architecture slide, create a one-slide composition under `decks/` and author its complete
geometry with scene primitives. Add a structured source under `diagrams/` only for a qualifying flow,
then embed that flow as one positioned element. These files preserve reproducibility and future revision
without limiting architecture composition.

## 5. Execute the pipeline autonomously

Keep presentation-specific helper scripts, probes, command captures, and intermediate conversions under
`.slide-artifacts/<deck-name>/tmp/`. Put any other disposable workspace files under `.tmp/<task>/`.
Never create temporary artifacts in the repository root or a source-controlled directory. Remove them
before handoff. `npm run deck:build` runs a mandatory post-build repository hygiene check; also require
`npm run repo:check` to pass before handoff.

Run the relevant local scripts yourself from the kit root. The standard internal sequence is:

1. Search and resolve assets.
2. Validate the diagram when one exists.
3. Run `npm run deck:build -- <deck.json>` to compile one shared scene and produce standalone HTML and lossless 4K PNGs.
4. Inspect every generated PNG with image tooling.
5. Repair content, scene geometry, graph semantics, assets, or renderer mapping at the layer that owns the defect.
6. Repeat validation and PNG review until clean.

Do not stop after authoring source files. A task is complete only when required validators pass and the
visual output has been inspected. Do not ask the user to perform a quality-control step that the agent
can perform.

## 6. Apply executive quality standards

Before handoff, verify:

- The slide or deck has an explicit audience and purpose.
- Each slide has one memorable takeaway.
- Titles state conclusions rather than generic topics.
- Content is legible when viewed at presentation scale.
- Readability takes priority over density: large unused regions are redistributed to cramped content before type or padding is reduced.
- Repeated peer cards use consistent dimensions and at least the rendered-content padding required by `design/design-contract.json`.
- Centered focal cards align every grouped text element to the same card centerline and declare `metadata.contentAlignment: center`.
- Architecture boundaries and connector meanings are truthful and unambiguous.
- Neutral cards and boxes use `$surface` (white in the light theme) with the near-black `$stroke` outline at a minimum 3:1 contrast against the fill. Semantic border colors remain valid when they carry meaning; lower-contrast or borderless exceptions require documented `outlineIntent`.
- Ordinary directional arrows match the primary flow connector: `$secondary`, 2.5px, with a filled triangular arrowhead.
- Diagram labels remain at least 18px after final slide scaling, with no collisions, clipped text, or connector crossings.
- Structured flow diagrams stay within 18 nodes; freeform architectures are governed by slide legibility,
  content budgets, overlap checks, and screenshot review rather than a structural component count.
- Current Microsoft claims have public sources.
- Private or missing evidence is clearly marked rather than fabricated.
- Azure service icons are official local assets where available.
- Automated validation passes with no unresolved errors.
- Screenshot review explicitly compares the densest and emptiest regions and repairs avoidable imbalance.
- Screenshot review rejects mixed text alignment inside a focal card unless the asymmetry is intentional and documented.
- The repository hygiene check passes with no temporary artifacts outside approved scratch directories.
- Every generated PNG has been visually reviewed for hierarchy, density, clipping, and misleading flow.
- Every delivered PNG is lossless and exactly `3840x2160`.
- Reference-image conversions pass a verbatim content-and-semantics comparison, with every approved deviation recorded in speaker notes.
- Every standalone HTML page renders at exactly 16:9 and the manifest contains the expected slide count.
- The delivery manifest maps every slide to its HTML and PNG and records the expected dimensions.

## 7. Deliver in business language

Return a concise handoff containing:

- clickable links to the lossless 4K PNGs first;
- clickable links to the standalone HTML output;
- the slide count and one-line narrative summary;
- important content assumptions, source gaps, or placeholders;
- the brand status from the delivery manifest (`aligned-not-certified`, `approved-internal`, or `custom-approved`);

Final handoff files live under `deliverables/<deck-name>/`; `.slide-artifacts/` is internal working
space only. Never send the user into intermediate validation folders to find the presentation.

Do not lead with command logs, schemas, JSON paths, package details, or validation internals. Mention a
technical blocker only when it prevented delivery and explain the practical consequence and next action.
Describe output as Fluent-aligned unless an authorized brand owner has approved it.

## Natural-language examples

- "Create one executive slide explaining Azure Advisor architecture."
- "Build a five-slide decision deck comparing two Azure migration options for the CFO."
- "Turn this document into a board-ready presentation and flag unsupported claims."
- "Show our target workflow with approvals and an exception path."
- "Review the latest deck, fix visual issues, and give me the 4K PNGs and HTML scenes."
