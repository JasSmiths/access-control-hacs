# Releasing

This repository contains two independently versioned artifacts:

- Main application
- Home Assistant integration

## Version sources

- App version: `package.json`
- HA integration version: `custom_components/crest_house_access/manifest.json`

## Current baseline

- App: `0.1.0`
- HA integration: `0.3.6`

## When to bump each version

- Bump the app version for changes to the web UI, admin features, backend API,
  auth, reporting, database behavior, or deployment/runtime behavior.
- Bump the HA integration version for changes to the integration manifest,
  entities, polling behavior, config flow, translations, or Home Assistant API
  compatibility.
- Bump both when a change affects both surfaces.

## Tagging

Use prefixed git tags so releases are unambiguous in a single repository:

- App tag format: `app-vX.Y.Z`
- HA tag format: `ha-vX.Y.Z`

Examples:

- `app-v0.1.0`
- `ha-v0.3.6`

## Practical workflow

1. Update the relevant version field.
2. Commit the release change.
3. Create the matching prefixed tag.
4. Push the commit and the tag.

Example app release:

```bash
git tag -a app-v0.1.1 -m "App release 0.1.1"
git push origin main
git push origin app-v0.1.1
```

Example HA release:

```bash
git tag -a ha-v0.3.7 -m "HA release 0.3.7"
git push origin main
git push origin ha-v0.3.7
```
