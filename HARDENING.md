<!-- markdownlint-disable -->

# Hardening Report: DeterminateSystems--magic-nix-cache-action/v14

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **DeterminateSystems--magic-nix-cache-action/v14** was hardened automatically. 4 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

Multiple `uses:` references in ci.yml use mutable tags or branch names instead of pinned 40-character SHA digests, making the workflow vulnerable to supply-chain attacks if the referenced action is compromised or altered. Failing references: `actions/checkout@v6`, `DeterminateSystems/determinate-nix-action@main`, `DeterminateSystems/magic-nix-cache-action@main`, `actions/cache@v5`, `DeterminateSystems/nix-installer-action@main`.

Locations:

- `.github/workflows/ci.yml:17`
- `.github/workflows/ci.yml:18`
- `.github/workflows/ci.yml:19`
- `.github/workflows/ci.yml:30`
- `.github/workflows/ci.yml:44`
- `.github/workflows/ci.yml:55`
- `.github/workflows/ci.yml:57`
- `.github/workflows/ci.yml:87`
- `.github/workflows/ci.yml:89`

### unpinned-uses (severity: high)

Multiple `uses:` references in flakehub-cache.yml use mutable tags or branch names instead of pinned 40-character SHA digests. Failing references: `actions/checkout@v6`, `DeterminateSystems/determinate-nix-action@main`, `DeterminateSystems/flakehub-cache-action@main`.

Locations:

- `.github/workflows/flakehub-cache.yml:23`
- `.github/workflows/flakehub-cache.yml:24`
- `.github/workflows/flakehub-cache.yml:25`

### script-injection (severity: high)

Rule (a) violation: A `${{ }}` expression is interpolated directly inside a `run:` shell command. The line `nix build .#devShells.${{ matrix.systems.nix-system }}.default` embeds `${{ matrix.systems.nix-system }}` directly into the shell command string. Although `matrix.*` values are typically workflow-controlled, any `${{ ... }}` inside a `run:` block is a script-injection risk because the value is substituted by the template engine before the shell ever sees it, bypassing shell quoting. Fix by moving the value into an `env:` variable and referencing it as a quoted shell variable: `env: NIX_SYSTEM: ${{ matrix.systems.nix-system }}` then `nix build ".#devShells.${NIX_SYSTEM}.default"`.

Locations:

- `.github/workflows/flakehub-cache.yml:28`

### missing-permissions (severity: medium)

The `success` job in ci.yml has no `permissions:` block, and there is no top-level `permissions:` key in the file. Because at least one job lacks explicit permissions, the workflow inherits the default (potentially broad) repository permissions for that job. All jobs must have explicit `permissions:` blocks, or a restrictive top-level `permissions:` must be set.

Locations:

- `.github/workflows/ci.yml:113`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses, script-injection, missing-permissions

**Notes:**

Fixed all findings across ci.yml and flakehub-cache.yml:

1. **unpinned-uses (ci.yml)**: Pinned all 9 unpinned action references:
   - `actions/checkout@v6` → `@d23441a48e516b6c34aea4fa41551a30e30af803 # v6` (5 occurrences)
   - `DeterminateSystems/determinate-nix-action@main` → `@d96678350ffd6a456235832eb11e1c491589b7bb # main` (2 occurrences)
   - `DeterminateSystems/magic-nix-cache-action@main` → `@55718cd9ebf1737a061487d5ada21abf31e99a98 # main`
   - `actions/cache@v5` → `@caa296126883cff596d87d8935842f9db880ef25 # v5`
   - `DeterminateSystems/nix-installer-action@main` → `@33c9ab3ef95cd57c164d9d6eb1f9a46338538d41 # main`

2. **unpinned-uses (flakehub-cache.yml)**: Pinned all 3 unpinned action references:
   - `actions/checkout@v6` → `@d23441a48e516b6c34aea4fa41551a30e30af803 # v6`
   - `DeterminateSystems/determinate-nix-action@main` → `@d96678350ffd6a456235832eb11e1c491589b7bb # main`
   - `DeterminateSystems/flakehub-cache-action@main` → `@77c6bddd7d747943530aaa578c57f233ee5d920e # main`

3. **script-injection (flakehub-cache.yml line 28)**: Moved `${{ matrix.systems.nix-system }}` out of the `run:` block into an `env:` variable `NIX_SYSTEM`, then referenced it as `${NIX_SYSTEM}` in the shell command.

4. **missing-permissions (ci.yml success job)**: Added `permissions: {}` to the `success` job which requires no special permissions.

