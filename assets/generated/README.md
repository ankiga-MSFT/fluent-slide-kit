# Generated presentation imagery

Store approved AI-generated hero photography, conceptual illustration, and editorial backgrounds here.

Every reference in deck JSON must use:

```json
{
    "kind": "image",
    "path": "assets/generated/<file>.png",
    "alt": "A useful description of the visible content",
    "provenance": "ai-generated"
}
```

Accepted formats are SVG, PNG, and JPEG. Prefer PNG or JPEG for generated bitmap imagery.

Do not store generated whole slides, text, charts, logos, Microsoft product icons, architecture diagrams,
or workflows here. Those elements must remain structured and editable.