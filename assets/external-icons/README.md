# Approved external icons

This directory contains approved non-Azure, non-Fluent product and vendor icons used by presentation sources.

Every bundled icon must:

- come from an official vendor-owned source;
- be pinned to an immutable revision;
- appear in `catalog.json` with vendor, source, revision, license, license file, and trademark notice;
- preserve the official SVG geometry, proportions, and colors;
- use `assetKind: external` and `provenance: external-catalog` in composition JSON.

Do not place arbitrary web downloads or third-party logo mirrors here. Search this catalog with:

```powershell
npm run assets:search -- "<product>" --collection external --json
```

GitHub and GitHub Copilot are trademarks of GitHub, Inc. Their inclusion does not imply endorsement.
