---
name: fluent-diagram
description: "Internal graph implementation playbook used by fluent-presentation for Azure architecture and workflow diagrams, semantic validation, SVG rendering, screenshot review, and deck embedding. Not an executive-facing workflow."
user-invocable: false
disable-model-invocation: true
---

# Fluent diagram workflow

This is an internal playbook. The `fluent-presentation` skill owns user interaction. Execute every
command and quality-control step yourself; never ask the user to edit graph JSON, run commands, choose
asset paths, or inspect raw reports.

## Scope

Use this skill for workflow and architecture communication. It produces an accessible standalone SVG
from `diagrams/<name>.json` and can embed it in a `diagram` deck slide. Use `fluent-deck` for
the surrounding narrative, slide sequence, HTML rendering, and screenshot handoff.

The schema supports two intentionally different visual grammars:

- `flow`: ordered behavior where nodes and connectors communicate sequence, branching, merging,
  decisions, dependencies, asynchronous work, or responsibility.
- `layered-architecture`: a stable capability view organized into two to six horizontal layers, one
  to five aligned columns, component rows, and an optional cross-cutting concerns rail.

## 1. Establish diagram semantics

Identify the audience, question the diagram answers, system boundary, level of detail, flow direction,
and whether edges represent data, control, dependency, error, or asynchronous work. Separate current,
target, and conceptual states rather than mixing them.

Never invent deployed resources, network boundaries, protocols, data classification, redundancy, or
service capabilities. Use Microsoft Learn MCP for current public Azure facts. Use read-only Azure
inventory tooling only when the user explicitly wants a deployed-resource view.

## 2. Choose the visual grammar

Choose `flow` when the audience must follow what happens next, why a branch is taken, or how work moves
between owners. Choose `layered-architecture` when the audience must understand tiers, channels,
capabilities, publication surfaces, governance, or how concerns apply across a system. Do not represent
a stable layered architecture as a dense workflow merely because services have relationships.

Use the simple deck `architecture` layout instead when the complete message is only a two-to-five-step
linear sequence.

## 3. Choose primitives

Author against `schemas/diagram.schema.json`:

- For `flow`: node kinds, edge kinds, groups, lanes, legends, direction, and intentional cycles.
- For `layered-architecture`: columns, layers, components with optional column spans, and cross-cutting concerns.

Give every element a stable lowercase id. In a flow, label decision outcomes, set `allowCycles: true`
only for intentional feedback, and keep a group within one lane. In a layered architecture, do not
overlap component spans within a layer and use the concern rail only for properties that genuinely
apply across layers.

## 4. Resolve assets

Search every Azure or Fluent visual before adding it:

```powershell
npm run assets:search -- "Azure Front Door" --collection azure --json
npm run assets:search -- "database" --collection fluent --style regular --json
```

Copy the exact path into the node or component asset. An `azure-service` flow node requires an official
local Azure asset, visible service label, and useful alt text. Do not recolor or redraw Azure artwork.

## 5. Author and validate

Start a workflow from `diagrams/azure-request-flow.json`; start a capability architecture from
`diagrams/advisor-kusto-publishing.json`. Render and validate with:

```powershell
npm run diagram:render -- diagrams/<name>.json
npm run diagram:validate -- diagrams/<name>.json
```

The validator checks schema and ids, references and spans, asset containment, flow semantics, a fixed
`1600x720` viewBox, effective font sizes, text and card bounds, item collisions, connector crossings,
rounded corners on every visible rectangle, embedded SVG assets, serious WCAG issues, and a deterministic screenshot.

The kit uses deterministic dependency-free renderers. Do not manually position elements or edit generated
SVG. A flow is limited to 18 nodes. A layered architecture is limited to 15 components, five columns,
six layers, and five cross-cutting concerns. All presentation labels must remain at least 18px at final
scale. Split denser systems into context, capability, component, deployment, or workflow views.

## 6. Review the screenshot

- The title states what the topology or flow demonstrates.
- The system boundary and abstraction level are unambiguous.
- Primary flow is visually dominant and reads in the declared direction.
- Branch labels explain conditions; merge points remain traceable.
- Synchronous, asynchronous, dependency, and error paths are not conflated.
- Groups and lanes convey real boundaries or ownership rather than decoration.
- Every visible node, component, lane, boundary, concern, and label chip has rounded corners; use icons and labels instead of sharp-corner shape semantics.
- Service labels remain readable and official Azure icons retain their artwork.
- A legend is present when line styles or tones carry meaning.
- Layered architecture has one obvious reading order and its concern rail does not repeat layer content.
- No label relies on ellipsis to fit; shorten, wrap, or split the view instead.

## 7. Embed in a deck

Reference the validated source graph from a deck slide:

```json
{
  "layout": "diagram",
  "diagram": {
    "path": "diagrams/<name>.json",
    "alt": "Describe the significant nodes, direction, and branches."
  }
}
```

Run `npm run deck:validate -- <deck.json>`. The deck renderer generates and embeds the SVG inline, so
the HTML remains offline and does not depend on a separately copied diagram file.

For PowerPoint, `layered-architecture` compiles to native editable shapes, text, connectors, and
individual icons. In the current implementation, `flow` renders as a browser-validated graphic because
PowerPoint does not preserve nested SVG image assets reliably. Record that exception in the delivery
manifest and never describe a complex flow slide as fully shape-editable.

## 8. Hand off

Report the diagram JSON, standalone SVG, validation report, screenshot, chosen visual grammar, factual
source gaps, and any intentional cycles or disconnected components. State whether the diagram is
conceptual, reference, target-state, or derived from deployed inventory.
