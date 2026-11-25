# Git Workflow

This project follows the fairyfox system's **git-flow** standard (the branching model, not the
`git flow` CLI — plain `git` carries it). These are procedures the AI upholds by judgement, not
automation. Canonical source: `hub/standards/git-workflow.md` in the system clone.

## Branch model

git-flow runs **two long-lived branches** and **three kinds of short-lived support branch**.

- **`main`** — production, and the repo's stable and default branch. In this fork it advances by a
  direct push of verified work on the owner's explicit go-ahead (see "Pushing to `main`" below). Work
  is still committed on a `feature/*` branch first: a **PATCH** goes from `dev` or that branch; a
  **MINOR/MAJOR** goes through a `release/*` branch; an urgent fix goes through a `hotfix/*` branch.
  (`master` was renamed to `main` on 2026-06-25 to adopt the system standard — `master` is no longer
  used.)
- **`dev`** — the integration branch (git-flow's `develop` role, kept under the shorter name). All
  finished work lands here first. **This is the branch the hub tracks for sync** (the registry
  `branch:` field).
- **`feature/<name>`** — the normal unit of work. Branch from `dev`, build, merge **back into `dev`**
  with `--no-ff`, then delete. Never branch a feature off `main`.
- **`release/<x.y.0>`** — the mechanism for a **MINOR or MAJOR** release. Branch from `dev` to bake the
  release (final polish, `VERSION` bump, changelog), merge **into `main`** + tag **and** back into
  `dev` (`--no-ff` both), then delete.
- **`hotfix/<x.y.z>`** — an urgent production fix. Branch from `main`, fix, merge **into `main`** + tag
  **and** back into `dev` (`--no-ff` both), then delete.

Support-branch names use a `type/` prefix plus a short kebab-case description.

## Developing a feature

```sh
git checkout dev
git checkout -b feature/<name>
# … commit work on the feature branch, push it to back it up …
git checkout dev
git merge --no-ff feature/<name>     # keeps the feature as one revertible unit
git branch -d feature/<name>
git push origin dev
```

The `--no-ff` merge commit groups the feature's commits under one parent — legible in history and
revertible in one move (`git revert -m 1 <merge>`).

**Solo / small-project latitude:** a genuinely **trivial** change (a typo, a one-line doc fix) may be
committed directly on `dev` rather than via a `feature/*` branch. Anything that is really "a feature,"
or is large/risky, still gets its own branch. The release path below is **not** latitude — it is fixed
by the SemVer level.

## Pushing to `main` (this fork: no pull request)

Upstream (`1fairyfox/random-ai-prompt`) protects `main` and lands every change through a pull request.
**This fork does not** (owner, 2026-11-25): its `main` is unprotected, there is no second reviewer or
CI to gate on, and verified work is pushed directly. What still holds:

- The owner explicitly asks for each push to `main`.
- `npm test` is green and `npm run check:committed` passes.
- The push is a fast-forward. Never force it.
- Pushing is not releasing. This fork is a personal project with no releases, and the owner disabled
  GitHub Actions (2026-11-25). If Actions is ever re-enabled, an untagged `VERSION` would publish a
  public release on push (see "Who creates the tag" below), so ask first.

This is a recorded local divergence from the hub git-workflow standard. Contributing back to upstream
still means a pull request there.
## Cutting a release

The release path is set by the SemVer level (see [`versioning.md`](versioning.md)). Each path ends with a
direct fast-forward push to `main`.
> **⚠ Local correction (pending hub adoption).** The upstream (hub) form of these flows merged into
> `main` but never brought `main` back to `dev`, so **every release left a merge commit on `main` that
> `dev` never received** — `dev` drifts behind `main`, one commit per release. Observed live: `dev` was
> 32 commits behind `main`. **Invariant to hold: after every release, `dev` must CONTAIN `main`** — so
> the release ends by fast-forwarding `dev` up to `main`. The corrected commands below do this. Proposed
> back to the hub in `notes/fairyfox-reports/2026-07-01-propose-git-workflow-backmerge.md`; a scheduled
> `branch-sync` workflow guards the invariant.

- **PATCH** (the default — fixes, docs, ordinary changes): from the verified working branch.

  ```sh
  npm test
  git fetch origin
  git merge-base --is-ancestor origin/main HEAD   # must succeed; otherwise merge origin/main and re-test
  git push origin HEAD:main                       # do NOT tag by hand
  ```

- **MINOR / MAJOR** (a milestone): finalize on a **`release/X.Y.0`** branch (bump `VERSION`, finish the
  changelog, last polish), then push it the same way and delete the spent branch. (MAJOR → `1.0.0` etc.
  is the owner's call only.)

If `dev` is in use, end either path by catching it up so `dev` contains `main`:

```sh
git switch dev
git merge --ff-only origin/main
git push origin dev
```
Where GitHub Actions is enabled, a push to `main` after a `VERSION` bump cuts a GitHub Release (`release.yml`,
tag-gated) and refreshes the Pages docs (`pages.yml`). See [`deployment.md`](deployment.md).

## Who creates the tag — CI, not by hand (this repo)

The branch commands above **push `main` without tagging.** This project's
[`release.yml`](deployment.md) derives `v<VERSION>` and creates the tag itself on the `main` push, and
**gates the release on that tag not already existing.** So a tag pushed by hand makes the gated workflow
find the tag present and **skip itself — a silent no-op release.** The rule for this repo is therefore:

- **The push to `main` is the release act; CI applies the tag.** Never run `git tag` / `git push
  --tags` for a release here.
- GitHub Actions is disabled on this fork, so its pushes are untagged. Nothing here tags by hand either.

(This is a deliberate, recorded divergence from the hub's hand-tag example commands, which assume a
project whose `release.yml` does *not* tag. The hub documents exactly this CI-vs-hand fork.)

## Hotfixes

```sh
git fetch origin
git switch -c hotfix/X.Y.Z origin/main   # branch from main's tip
# … fix, bump VERSION (patch), changelog …
git push origin hotfix/X.Y.Z
npm test
git push origin HEAD:main                 # fast-forward; do NOT tag by hand
git push origin --delete hotfix/X.Y.Z     # the spent branch
git fetch origin
git switch dev
git merge --ff-only origin/main           # catch dev up to main (carries the hotfix) so dev ⊇ main
git push origin dev
```

## Commit style

- Focused, present-tense `type: summary` messages (e.g. `build: migrate to ES modules + Node 24`,
  `chore: add eslint + prettier`, `docs: add notes system`).
- **Stage specific files** (`git add <paths>`), never `git add -A` / `git add .`.
- The changelog entry for a substantive change rides **inside the same commit** (top of
  `notes/version/YYYY-MM.md`) — see [`../version.md`](../version.md).
- Keep `VERSION` **and** `package.json` current as part of the release — bumped on `dev` for a PATCH,
  or on the `release/*` / `hotfix/*` branch for a milestone/hotfix; the release tag on `main` matches
  it. See [`versioning.md`](versioning.md).

## Merging — `--no-ff`, never rewrite

git-flow merges create a **merge commit** (the `--no-ff` effect): features merge `--no-ff` into `dev`
locally; `main` advances by a direct fast-forward push. This is all **additive** — it never rewrites history.
Nothing on GitHub blocks a force-push to this fork's `main`, so the safety rules below are what
protect it.

## Hard safety rules (absolute)

- Never `git push --force` / `--force-with-lease` / rewrite pushed history. (git-flow's `--no-ff` merge
  commits are additive and allowed — they are not a rewrite.)
- Never `git reset --hard`, `rebase`, `clean -fd`, or delete a **long-lived** branch (`main`/`dev`)
  without an explicit request. Spent `feature/`/`release/`/`hotfix/` branches are deleted as the normal
  end of their merge.
- Inspect `git status` **before and after** every git operation.
- Don't commit user data / runtime artifacts: `user-settings.json`, `results.json`, `output/`,
  `node_modules/` (all gitignored).

## Pre-release manifest gate (hub 0.21.0)

Before a release to `main`, the [adoption manifest](adoption-manifest.md) must be current: any
"standards adopted" claim in the release/changelog is backed by a manifest row, and the full
local gate (`npm test`) is green, plus CI wherever GitHub Actions is enabled. `copied-only` rows may ship; they may **not** be reported as `implemented`.

## Verify (is it being followed?)

The check that catches a violation — run on request, report `done`/`partial`/`missing`
(the per-standard slice the [compliance audit](compliance.md) aggregates):

| Passes only when… | How to check |
|-------------------|--------------|
| Stable branch is **`main`**, not `master` | `git branch -a` |
| Every push to `main` was a fast-forward the owner asked for | `git log --oneline main`; session log |
| Pushed history is intact — no force-push / rebase / reset of published commits | history stable across fetches; no `--force` in reflog |
| Spent `feature/`/`release/`/`hotfix/` branches deleted; `main`/`dev` intact | `git branch -a` |
| Each push to `main` rode a green build/test checkpoint | `npm test` recorded green in the session log |
