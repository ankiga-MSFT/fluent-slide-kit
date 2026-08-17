---
name: fluent-diagram
description: "Internal graph implementation playbook used by fluent-presentation for branching workflows, semantic validation, SVG rendering, screenshot review, and deck embedding. Not an executive-facing workflow and not used for architecture composition."
user-invocable: false
disable-model-invocation: true
---

# Fluent diagram workflow

This is an internal playbook. The `fluent-presentation` skill owns user interaction. Execute every
command and quality-control step yourself; never ask the user to edit graph JSON, run commands, choose
asset paths, or inspect raw reports.

## Scope

Use this skill only for ordered behavior where nodes and connectors communicate branching, merging,
decisions, dependencies, asynchronous work, cycles, or responsibility. It produces an accessible
standalone SVG from `diagrams/<name>.json` and can embed it as a positioned `diagram` element.

Use `fluent-deck` and native freeform primitives for architecture, system context, capabilities, tiers,
channels, governance, deployment views, and reference-image reconstruction. Those compositions must retain
full spatial freedom and native PowerPoint editability.

## 1. Establish diagram semantics

Identify the audience, question the diagram answers, system boundary, level of detail, flow direction,
and whether edges represent data, control, dependency, error, or asynchronous work. Separate current,
target, and conceptual states rather than mixing them.

Never invent deployed resources, network boundaries, protocols, data classification, redundancy, or
service capabilities. Use Microsoft Learn MCP for current public Azure facts. Use read-only Azure
inventory tooling only when the user explicitly wants a deployed-resource view.

## 2. Confirm graph semantics

Choose `flow` when the audience must follow what happens next, why a branch is taken, where paths merge,
or how work moves between owners. Use native shape, text, image, and line elements when the message is a
short linear sequence or any architecture view. Do not represent a stable architecture as a workflow
merely because services have relationships.

## 3. Choose primitives

Author `flow` against `schemas/diagram.schema.json` using node kinds, edge kinds, groups, lanes, legends,
direction, and intentional cycles.

Set `theme` explicitly. For an embedded diagram, match the host slide's resolved theme; for a
standalone diagram, use the theme confirmed with the user. Never silently reset a dark request to light.

Give every element a stable lowercase id. Label decision outcomes, set `allowCycles: true` only for
intentional feedback, and keep a group within one lane.

## 4. Resolve assets

Inventory every node visual and structural role, then search every Azure or Fluent concept before adding it:

```powershell
npm run assets:search -- "Azure Front Door" --collection azure --json
npm run assets:search -- "database" --collection fluent --style regular --json
npm run assets:search -- "GitHub Copilot" --collection external --json
```

Copy the exact path into the node asset. An `azure-service` flow node requires an official
local Azure asset, visible service label, and useful alt text. Do not recolor or redraw Azure artwork.
Non-Azure, non-Fluent product icons must come from the approved `assets/external-icons/` catalog with
official pinned source, license, and trademark metadata; never reference an arbitrary web asset directly.
Use exact catalog matches for node pictograms. Keep graph edges, arrowheads, dash patterns, lanes, boundaries,
and node cards as native renderer geometry because Arrow, Line Dashes, Square, and Card UI catalog matches are
standalone glyphs rather than extensible graph components. If no suitable node icon exists, use a labeled node
instead of inventing an icon.

## 5. Author and validate

Start a qualifying workflow from `diagrams/templates/flow.json`. Save the request-specific copy directly
under `diagrams/`; those local sources are ignored by Git. Render and validate with:

```powershell
npm run diagram:render -- diagrams/<name>.json
npm run diagram:validate -- diagrams/<name>.json
```

Keep diagram-specific helper scripts, probes, and command captures under `.slide-artifacts/<name>/tmp/`.
Use `.tmp/<task>/` for general disposable work. Never create temporary files in the repository root or
a source-controlled directory, and require `npm run repo:check` to pass before handoff.

The validator checks schema and ids, endpoint references, asset containment, flow semantics, a fixed
`1600x720` viewBox, effective font sizes, text and card bounds, item collisions, connector crossings,
rounded corners on every visible rectangle, embedded SVG assets, serious WCAG issues, and a deterministic screenshot.

The kit uses deterministic dependency-free renderers. Do not manually position elements or edit generated
SVG. A flow is limited to 18 nodes. All presentation labels must remain at least 18px at final scale.
Split denser workflows into focused views.

Readability outranks density. Use available graph canvas and split views before reducing label size or node
padding. Keep peer nodes consistent and avoid leaving one region empty while another rank or lane is compressed.

## 6. Review the screenshot

- The title states what the topology or flow demonstrates.
- The system boundary and abstraction level are unambiguous.
- Primary flow is visually dominant and reads in the declared direction.
- Primary connectors use the shared `$secondary`, 2.5px, filled-triangle treatment unless documented edge semantics require another style.
- Branch labels explain conditions; merge points remain traceable.
- Synchronous, asynchronous, dependency, and error paths are not conflated.
- Groups and lanes convey real boundaries or ownership rather than decoration.
- Every visible node, lane, boundary, and label chip has rounded corners; use icons and labels instead of sharp-corner shape semantics.
- Keep parent surfaces and neutral components on `$surface`, which resolves to white in the light theme. Use a non-white fill only for explicit user direction or documented brand, success, warning, or danger meaning; never use alternating fills as decoration.
- Service labels remain readable and official Azure icons retain their artwork.
- A legend is present when line styles or tones carry meaning.
- No label relies on ellipsis to fit; shorten, wrap, or split the view instead.

## 7. Embed in a deck

Reference the validated source graph from a deck slide:

```json
{
  "id": "decision-flow",
  "type": "diagram",
  "z": 10,
  "box": { "x": 160, "y": 220, "width": 1600, "height": 720 },
  "diagramPath": "diagrams/<name>.json",
  "alt": "Describe the significant nodes, direction, and branches."
}
```

Run `npm run deck:validate -- <deck.json>`. The deck renderer generates and embeds the SVG inline, so
the HTML remains offline and does not depend on a separately copied diagram file.

In the current implementation, `flow` renders as a browser-validated graphic because PowerPoint does not
preserve nested SVG image assets reliably. Record that exception in the delivery manifest and never
describe a complex flow slide as fully shape-editable. Architecture slides remain native because they
are authored directly through `fluent-deck`.

## 8. Hand off

Report the diagram JSON, standalone SVG, validation report, screenshot, chosen visual grammar, factual
source gaps, and any intentional cycles or disconnected components. State whether the diagram is
conceptual, reference, target-state, or derived from deployed inventory.
