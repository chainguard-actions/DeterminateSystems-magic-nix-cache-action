<!-- markdownlint-disable -->

# Hardening Report: DeterminateSystems--magic-nix-cache-action/v14

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `1`

Action **DeterminateSystems--magic-nix-cache-action/v14** was hardened automatically. 4 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

Multiple `uses:` references in .github/workflows/ci.yml use mutable tag or branch refs instead of pinned 40-character SHA digests, making the workflow vulnerable to supply-chain attacks if those tags/branches are moved or compromised. Failing references: `actions/checkout@v6` (lines 17, 62, 72, 115), `DeterminateSystems/determinate-nix-action@main` (lines 18, 74), `DeterminateSystems/magic-nix-cache-action@main` (line 19), `actions/cache@v5` (line 30), `DeterminateSystems/nix-installer-action@main` (line 117).

Locations:

- `.github/workflows/ci.yml:17`
- `.github/workflows/ci.yml:18`
- `.github/workflows/ci.yml:19`
- `.github/workflows/ci.yml:30`
- `.github/workflows/ci.yml:62`
- `.github/workflows/ci.yml:72`
- `.github/workflows/ci.yml:74`
- `.github/workflows/ci.yml:115`
- `.github/workflows/ci.yml:117`

### unpinned-uses (severity: high)

Multiple `uses:` references in .github/workflows/flakehub-cache.yml use mutable tag or branch refs instead of pinned 40-character SHA digests. Failing references: `actions/checkout@v6` (line 17), `DeterminateSystems/determinate-nix-action@main` (line 18), `DeterminateSystems/flakehub-cache-action@main` (line 19).

Locations:

- `.github/workflows/flakehub-cache.yml:17`
- `.github/workflows/flakehub-cache.yml:18`
- `.github/workflows/flakehub-cache.yml:19`

### script-injection (severity: high)

Sub-rule (a): A `run:` block in flakehub-cache.yml directly interpolates a `${{ matrix.systems.nix-system }}` expression into the shell command string: `nix build .#devShells.${{ matrix.systems.nix-system }}.default`. Any `${{ ... }}` expression inside a `run:` block is substituted by the YAML template engine before the shell sees it, bypassing shell quoting and enabling script injection. The value should be passed via an `env:` variable and referenced as a quoted shell variable instead.

Locations:

- `.github/workflows/flakehub-cache.yml:21`

### missing-permissions (severity: medium)

The workflow file ci.yml has no top-level `permissions:` block, and the `success` job (the final job in the file) has no job-level `permissions:` block either. Without explicit permissions, the job inherits the default repository token permissions, which may be broader than necessary. All jobs should declare explicit minimal permissions.

Locations:

- `.github/workflows/ci.yml:148`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses, script-injection, missing-permissions

**Notes:**

Fixed all findings across ci.yml and flakehub-cache.yml:

1. **unpinned-uses (ci.yml)**: Pinned all 9 action references:
   - `actions/checkout@v6` → `@df4cb1c069e1874edd31b4311f1884172cec0e10` (lines 17, 62, 72, 115)
   - `DeterminateSystems/determinate-nix-action@main` → `@2a0be2498974c2b6327e19780488744384637d88` (lines 18, 74)
   - `DeterminateSystems/magic-nix-cache-action@main` → `@55718cd9ebf1737a061487d5ada21abf31e99a98` (line 19)
   - `actions/cache@v5` → `@caa296126883cff596d87d8935842f9db880ef25` (line 30)
   - `DeterminateSystems/nix-installer-action@main` → `@33c9ab3ef95cd57c164d9d6eb1f9a46338538d41` (line 117)

2. **unpinned-uses (flakehub-cache.yml)**: Pinned all 3 action references:
   - `actions/checkout@v6` → `@df4cb1c069e1874edd31b4311f1884172cec0e10`
   - `DeterminateSystems/determinate-nix-action@main` → `@2a0be2498974c2b6327e19780488744384637d88`
   - `DeterminateSystems/flakehub-cache-action@main` → `@3be0931021788e3bb4df65f59a555039c2fa2d46`

3. **script-injection (flakehub-cache.yml line 21)**: Moved `${{ matrix.systems.nix-system }}` out of the `run:` block into an `env:` variable `NIX_SYSTEM`, then referenced it as `$NIX_SYSTEM` in the shell command.

4. **missing-permissions (ci.yml success job)**: Added `permissions: {}` to the `success` job which had no permissions block, ensuring it runs with minimal (no) permissions.

