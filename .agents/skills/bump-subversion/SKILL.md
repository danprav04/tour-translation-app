---
name: bump-subversion
description: Instructions for how to correctly bump the app's subversion.
---

# Bumping the Subversion

When you are asked to "bump the subversion" or change the subversion of the app, **DO NOT** modify the `version` field in `package.json` or `app.json`.

**Note:** If you are explicitly asked to "bump the version" (not the subversion), then you *should* modify the `version` field in both `package.json` and `app.json` to the next appropriate version number.

Instead, the subversion is maintained in the application's settings file. To correctly bump the subversion:

1. Open `src/app/settings.tsx`.
2. Locate the `appSubversion` variable (e.g., `const appSubversion = '02';`).
3. Increment this string value to the next appropriate number (e.g., `'03'`).

This variable combines with the main app version to display the full version (e.g., `1.5.5.02`) within the app.
