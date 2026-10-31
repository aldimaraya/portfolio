---
name: ship
description: Push the current feature branch, open or update its PR to main, review the diff locally, show the findings for the user to pick from, apply the chosen fixes, then queue a squash auto-merge behind CI. Run only when the user types /ship.
argument-hint: "[review level: low|medium|high|xhigh]"
disable-model-invocation: true
---

# /ship

Takes the current branch from "done locally" to "merged into `main`" in one pass. Stop at the first step
that fails and tell the user why. Never skip a step to keep things moving: the stops are the reason
this is safe to automate.

## 1. Preconditions

- The current branch must not be `main`. If it is, stop.
- The working tree must be clean (`git status --porcelain`). If it isn't, list what's uncommitted and
  ask the user whether to commit it (and with what message) or stop. Don't stash or discard it.
- `git fetch origin main`.

## 2. Local checks

Run `npm run lint`, `npm run typecheck` and `npm test`. If any fails, show the failing output and stop.
`build` is left to CI: it needs a reachable `DATABASE_URL` and runs the page queries against it, and CI
already runs it with its own database.

## 3. Schema guard

`git diff --name-only origin/main...HEAD -- prisma/schema.prisma`. If the schema changed, merging ships
code that expects a schema that production may not have yet (there is no migration history; `db:push` is
the only path). Show the schema diff, point out anything that isn't additive, and ask the user to confirm
they've already pushed it to production. The user runs that push, not you. Continue only on an explicit
yes. A yes in an earlier /ship run doesn't count for this one.

## 4. Bring the branch up to date

The `main` ruleset requires branches to be up to date before merging. If `origin/main` has commits the
branch doesn't, run `git merge origin/main`, not a rebase. The PR is squashed anyway, so a merge commit
costs nothing and avoids a force-push. On conflicts, stop and hand them to the user. If the merge brought
anything in, re-run step 2.

## 5. Push and open the PR

- `git push -u origin HEAD`.
- `gh pr view --json number,url,title` for an existing PR on this branch. If there isn't one, run
  `gh pr create --base main` with a title in the repo's commit style (`feat:` / `fix:` …, sentence case,
  plain words) and a short body saying what changed and why. End the body with:
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

## 6. Review — findings first, nothing applied yet

Invoke the `code-review` skill on the PR number, passing `$ARGUMENTS` as the level if the user gave
one. **Never pass `--comment` or `--fix`.** The repo is public: a review comment on a security weakness
publishes it next to the code, and CLAUDE.md forbids that. The review stays in this session.

Present the findings as a numbered list, most severe first, each with file:line, the defect, and the
proposed fix in a sentence. Then ask the user which to apply (AskUserQuestion, multi-select, with "none"
as an option). Apply nothing they didn't pick. If there are no findings, say so and go to step 8.

## 7. Apply the chosen fixes

- Make the fixes, then re-run step 2.
- Commit them as one commit in the style of earlier follow-ups, e.g.
  `fix: <what> from the PR #<n> review`, ending with the attribution trailer. If a fix closes a security
  weakness, the commit message and PR stay vague about it ("tighten the upload route's checks"). Don't
  describe how the weakness could be used.
- `git push`.

## 8. Queue the merge

`gh pr merge <n> --auto --squash`. GitHub merges as soon as the required `check` passes. Don't pass
`--delete-branch`: feature branches here are sometimes reused, and deleting one is the user's call.

Then `gh pr checks <n> --watch` (it can take several minutes, so use a long timeout).
- If CI passes and the PR shows `MERGED`, report the merge with the PR URL.
- If CI fails, show the failing job's log (`gh run view --log-failed`) and stop. Auto-merge stays queued,
  so a fix pushed to the branch will still merge on its own.
- If the checks are slow, report that auto-merge is queued and stop there. Don't poll.

## 9. After the merge

A squash merge leaves this branch's commits outside `main`, so a later PR from the same branch would
include them all again. Tell the user, and offer (don't run) one of:
- `git switch main && git pull` and start a new branch, or
- `git switch <branch> && git reset --hard origin/main` to keep reusing the branch name.
