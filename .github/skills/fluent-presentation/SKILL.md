---
name: fluent-presentation
description: "Create, revise, review, or export an executive-ready Microsoft or Azure presentation from a natural-language business brief. Use when an executive asks for a slide, deck, PowerPoint, presentation, visual, Azure architecture, process flow, recommendation, decision narrative, HTML preview, or executive summary. Own the complete workflow: clarify essential business intent, research current Microsoft facts, compose the visual argument, resolve assets, compile a shared scene, render and validate editable PowerPoint plus HTML previews, visually review, repair, and deliver without asking the user to run commands or edit files."
argument-hint: "Describe the audience, message or decision, evidence, and desired slide or deck"
---

# Fluent presentation concierge

## User experience contract

The user interacts only through natural language. Treat terminal commands, JSON, schemas, scene graphs,
asset paths, renderers, validators, Office automation, and screenshot automation as internal details.

Never ask the user to:

- run a command or open a terminal;
- create, copy, or edit JSON, HTML, SVG, CSS, or asset paths;
- choose a schema, renderer, layout id, or validation option;
- inspect a raw validation report;
- manually create screenshots, convert HTML, or assemble PowerPoint files.

Run the complete workflow with available tools. If a tool fails, diagnose and repair it before
reporting a blocker. In the final handoff, lead with the finished presentation and preview, not the
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

Always confirm the title and visual theme before authoring, in addition to those questions and even
when the rest of the request is clear. Propose one specific action title and either `light` or `dark`,
then ask the user to approve or replace both in one concise question. When supplied visual references
have a clearly dominant light or dark canvas, propose that theme and state that it came from the
reference. Explicit user direction always wins. For a deck, confirm the deck title and default theme,
then let slide titles follow from each slide's takeaway. Never author a title or theme silently.

For an underspecified request, default to an executive audience, a concise explanatory narrative,
public Microsoft sources, 16:9 output, and a single slide when the user says "a slide." Use light only
when there is no explicit theme and no visual-reference cue. State important assumptions in the handoff.

Never invent metrics, customer facts, deployed resources, topology, dates, quotes, or capabilities.
Use explicit placeholders when private evidence is unavailable.

## 2. Route the work internally

Choose the workflow without asking the user:

- Narrative slide or deck: follow the internal [deck playbook](../fluent-deck/SKILL.md).
- Architecture or workflow: compose directly when a few native elements communicate the story clearly.
  Follow the internal [diagram playbook](../fluent-diagram/SKILL.md) when branching, merging, decisions,
  boundaries, swim lanes, cycles, or layered topology need semantic validation.
- Mixed request: create the diagram first, validate it, then create the surrounding deck.
- Existing artifact review or repair: reproduce the issue, repair the owning source, revalidate, and
  return the revised deliverable.

Within the structured diagram workflow, choose `flow` when sequence and connectors carry the meaning; choose
`layered-architecture` when layers, channels, capabilities, or cross-cutting governance carry the meaning.

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

Use image generation only for hero photography, conceptual illustration, or an editorial background.
Never generate a whole slide, logo, Microsoft product icon, slide text, chart, architecture diagram, or
workflow as an image. Keep narrative text, data, and diagrams as structured editable content.

Every presentation is a static still-frame experience. Do not author animations, slide transitions,
autoplay, hover-dependent content, interactive controls, loading states, or motion-dependent meaning.
Motion tokens in the foundation snapshot are provenance-only and must not be applied to generated output.

## 4. Author the internal sources

Create local request source files under `decks/` and, when needed, `diagrams/`. They are reproducible
inputs for the current request but are intentionally ignored by Git; only reusable examples under
`examples/` and `diagrams/templates/` are versioned. Choose concise names derived from the topic. Keep
one takeaway per slide, make titles communicate claims, and add speaker notes and
sources. Prefer another slide over shrinking text or overloading one frame.

For a single architecture slide, create a one-slide composition under `decks/`. Add a structured source
under `diagrams/` only when the architecture meets the semantic threshold above, then embed it as one
positioned element. These files preserve reproducibility and future revision without user involvement.

## 5. Execute the pipeline autonomously

Keep presentation-specific helper scripts, probes, command captures, and intermediate conversions under
`.slide-artifacts/<deck-name>/tmp/`. Put any other disposable workspace files under `.tmp/<task>/`.
Never create temporary artifacts in the repository root or a source-controlled directory. Remove them
before handoff, and require `npm run repo:check` to pass.

Run the relevant local scripts yourself from the kit root. The standard internal sequence is:

1. Search and resolve assets.
2. Validate the diagram when one exists.
3. Run `npm run deck:build -- <deck.json> --preview` to compile one shared scene and produce HTML and editable PowerPoint.
4. Inspect every HTML and PowerPoint-rendered screenshot with image tooling.
5. Repair content, scene geometry, graph semantics, assets, or renderer mapping at the layer that owns the defect.
6. Repeat both validators and screenshot review until clean.

If an interactive PowerPoint session is open, do not close or automate it. Structural PPTX validation
must still pass; report that Office preview was safely skipped and retain the validated HTML preview.

Do not stop after authoring source files. A task is complete only when required validators pass and the
visual output has been inspected. Do not ask the user to perform a quality-control step that the agent
can perform.

## 6. Apply executive quality standards

Before handoff, verify:

- The slide or deck has an explicit audience and purpose.
- Each slide has one memorable takeaway.
- Titles state conclusions rather than generic topics.
- Content is legible when viewed at presentation scale.
- Architecture boundaries and connector meanings are truthful and unambiguous.
- Neutral cards and boxes use `$surface` (white in the light theme) unless the user requests another fill or documented focal or semantic intent requires one.
- Ordinary directional arrows match the primary flow connector: `$secondary`, 2.5px, with a filled triangular arrowhead.
- Diagram labels remain at least 18px after final slide scaling, with no collisions, clipped text, or connector crossings.
- Flow diagrams stay within 18 nodes; layered architectures stay within 15 components, five columns, and six layers.
- Current Microsoft claims have public sources.
- Private or missing evidence is clearly marked rather than fabricated.
- Azure service icons are official local assets where available.
- Automated validation passes with no unresolved errors.
- The repository hygiene check passes with no temporary artifacts outside approved scratch directories.
- Every HTML and available PowerPoint screenshot has been visually reviewed for hierarchy, density, clipping, and misleading flow.
- Every standalone HTML page renders at exactly 16:9 and the manifest contains the expected slide count.
- The PPTX contains native named Office objects, speaker notes, scene identity, and the expected slide count.
- Layered architectures are native editable shapes. Any complex flow embedded as a validated graphic is disclosed.

## 7. Deliver in business language

Return a concise handoff containing:

- a clickable link to the editable PowerPoint;
- clickable links to the HTML output and preview screenshots;
- the slide count and one-line narrative summary;
- important content assumptions, source gaps, or placeholders;
- the brand status from the delivery manifest (`aligned-not-certified`, `approved-internal`, or `custom-approved`);
- any slide listed as `validated-graphic` rather than `native-shapes`.

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
- "Review the latest deck, fix visual issues, and give me the editable PowerPoint and previews."
