---
name: fluent-deck
description: "Internal deck implementation playbook used by fluent-presentation for freeform composition authoring, shared-scene compilation, HTML and native PowerPoint rendering, dual validation, screenshot review, and repair. Not an executive-facing workflow."
user-invocable: false
disable-model-invocation: true
---

# Fluent deck workflow

This is an internal playbook. The `fluent-presentation` skill owns user interaction. Execute every
command and quality-control step yourself; never ask the user to edit files, run commands, or inspect
raw reports.

## Scope

Use this skill for presentation structure, narrative, slide composition, shared-scene compilation,
HTML and editable PowerPoint rendering, validation, and artifact handoff. The authoring model is a
fixed canvas of explicit primitives:

- `text`, `shape`, `line`, and `image` remain native Office objects.
- `diagram` embeds a graph authored and validated through the `fluent-diagram` skill when graph semantics earn the extra structure.

Keep simple sequences in native primitives. Do not hand-build branching, merging, boundaries, decisions,
swim lanes, cycles, or dense layered topology when the diagram model can validate them.

All deck output is static. Never add animations, slide transitions, autoplay, hover-only disclosure,
interactive controls, loading indicators, or motion-dependent meaning. The HTML and PowerPoint renderers
must communicate the complete message in a single still frame.

## 1. Establish the communication contract

Identify the audience, desired decision or outcome, supplied evidence, and one sentence the audience
should remember from each slide. Split slides that carry multiple takeaways. Never invent a metric,
quote, customer, date, source, topology, or product capability.

Use a bracketed placeholder for missing evidence, such as `[Add Q3 adoption rate]`. For current
Microsoft or Azure claims, query Microsoft Learn MCP and retain the source URL in the slide spec.

## 2. Compose the visual argument

Load `design/design-contract.json`, the selected file under `design/brand-profiles/`,
`design/fluent-foundation.json`, and `design/fluent-chart-foundation.json` before composing. Use the
brand profile as the renderer-facing contract and the foundation snapshots as attributed authoring
references. Do not replace presentation-scale typography with Fluent UI's smaller interface type ramp.

Start with the takeaway, not a template name. Choose a dominant reading pattern that fits the message:

- one decisive claim with restrained supporting evidence;
- parallel ideas with an obvious focal item;
- side-by-side alternatives built for comparison;
- an ordered path with a clear direction;
- evidence led by a metric, quotation, or product visual;
- an opt-in structured diagram for validated graph or layered semantics.

Author exact boxes and points on the `1920x1080` canvas. Keep a clear title zone, preserve safe margins,
use explicit z-order, and assign the same logical `group` to elements whose overlap is intentional.
Use semantic color and font tokens so the brand profile resolves presentation styling. Prefer another
slide over shrinking typography or accumulating decorative containers. Composition JSON owns authored
geometry; the compiler resolves tokens; HTML and PowerPoint renderers consume the same scene.

Set the confirmed deck theme explicitly; never omit `theme` and rely on a renderer fallback. Preserve
an existing deck's theme unless the user approves a change. Use slide-level overrides only for an
intentional section change. An embedded diagram must declare the same theme as its resolved slide.

## 3. Resolve assets and diagrams

Load `assets/manifest.json` and search before writing every asset path:

```powershell
npm run assets:search -- "security shield" --collection fluent --style regular --json
npm run assets:search -- "Azure Kubernetes Service" --collection azure --json
```

Copy exact returned paths. Keep Azure icons in original colors and proportions with visible labels
and useful alt text. Never infer or hand-type a path that was not returned by the local catalog search.

For a non-linear architecture or workflow, classify it with `fluent-diagram`, author
`diagrams/<name>.json`, and run:

```powershell
npm run diagram:validate -- diagrams/<name>.json
```

Then add a positioned `diagram` element with `diagramPath` and descriptive `alt`. Do not hand-edit the
rendered SVG. Surround it with native text or supporting primitives only when that improves the argument.

## 4. Author the deck

Create or update `decks/<deck-name>.json` against `schemas/composition.schema.json`, starting from
`examples/deck.json`. Files under `decks/` are local request sources and are not committed. Store
takeaways, notes, positioned elements, asset references, diagram references, and sources in JSON. Keep
titles within 10 words and body copy within 55 words.

## 5. Build and validate

Run after every substantive change:

```powershell
npm run deck:build -- decks/<deck-name>.json --preview
```

The default final bundle is `deliverables/<deck-name>/`. Use `.slide-artifacts/` only for temporary
validation, probes, and intermediate previews; never place the final handoff there.

The build validates semantic sources and the brand profile, compiles `deck.scene.json`, renders and
checks standalone HTML in Edge, creates a native editable `.pptx`, validates its Open XML structure,
and uses desktop PowerPoint for `1920x1080` previews when no interactive Office session is open.

For embedded diagrams it also enforces a fixed `1600x720` SVG viewBox, 18px minimum effective type,
text containment, item collisions, connector crossings, and rounded corners on every visible container.

PowerPoint output must contain stable named Office objects and speaker notes. Layered architecture is
native shapes, text, connectors, and individual icons. Complex flow remains a validated graphic until
its native-shape renderer is implemented; disclose this from `delivery-manifest.json`.

The visual footer is fixed: render only `Microsoft Confidential` at bottom left on every slide.
Keep sources, dates, slide numbers, deck labels, and other metadata in notes or manifests, never in the footer.

Inspect every screenshot. Automated checks cannot judge narrative quality, hierarchy, misleading
architecture, or whether an evidence visual supports the message. Fix composition JSON first; change shared CSS
or renderer code only for system-level defects, then run `npm test` and revalidate the example deck.

## 6. Review

- The title makes a claim rather than naming a topic.
- Every slide supports its documented takeaway.
- Factual claims have sources and unknowns remain explicit placeholders.
- Visual hierarchy is readable when the screenshot is scaled down.
- Every visible card, container, boundary, and label chip has rounded corners; only the full-slide background may be rectangular.
- Neutral containers use the subtle surface. Use brand color only for the focal item and success, warning, or danger only when the content carries that meaning; do not color every container or alternate tones decoratively.
- Fluent and Azure assets use exact local catalog paths.
- Diagram edges, labels, lanes, and boundaries match the stated system behavior.
- Color is not the only carrier of meaning.
- The complete message is visible without animation, transitions, hover, autoplay, or interaction.
- No generated slide depends on a CDN or network request.

## 7. Hand off

Report the editable PowerPoint first, then the generated HTML directory, PowerPoint and HTML previews,
one takeaway per slide, source gaps, unresolved placeholders, brand status, and editability exceptions.
Link from `deliverables/<deck-name>/` so the user never has to navigate intermediate validation folders.
The composition and persisted scene remain the reproducible sources; PowerPoint supports executive
light edits without becoming the source used for AI regeneration.

Describe output as Fluent-aligned unless an authorized brand owner has approved it.
