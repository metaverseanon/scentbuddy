---
name: Jest + Expo on pnpm
description: How to make jest-expo component tests run in this pnpm monorepo (transformIgnorePatterns + native mocks)
---

# Jest + jest-expo in a pnpm workspace

The Expo app (`artifacts/scentbuddy`) uses `jest-expo` for component tests
(`__tests__/*.test.tsx`, run via `pnpm --filter @workspace/scentbuddy test`).

## The pnpm gotcha
The default `jest-expo` `transformIgnorePatterns` is written for a flat
`node_modules/<pkg>` layout. pnpm stores real packages under
`node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>`, so the default regex
ignores (does NOT transform) `react-native` etc. and you get
`SyntaxError: Cannot use import statement outside a module` from
`react-native/jest/setup.js`.

**Fix:** make the negative lookahead tolerate the optional `.pnpm/<dir>/node_modules/`
prefix, e.g.
`node_modules/(?!(?:\\.pnpm/[^/]+/node_modules/)?(?:(jest-)?react-native|@react-native...|expo...|@nkzw...))`.

## Native modules still need manual mocks
Even with transforms working, mock the UI/native libs the screens import:
`expo-blur`, `expo-linear-gradient`, `react-native-view-shot`, `expo-haptics`,
`expo-media-library`, `react-native-safe-area-context`, and `phosphor-react-native`
(mock the whole module with a Proxy returning a stub component — it has hundreds of
named icon exports). Providers built with `@nkzw/create-context-hook` are mocked
per-test by replacing the `useXxx` hook export.

**Why:** these have no Node-runnable implementation under jsdom; without mocks the
render throws. This setup lets us render whole expo-router screens headless and
assert on the tree (used for the Pro-gating regression tests).
