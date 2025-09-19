# Branch Protection Configuration

## Current Issue: PR Merge Not Blocked When Tests Pass

The issue reported is that PRs can be merged even when tests pass, which suggests missing branch protection rules.

## Required Branch Protection Rules

To properly block PR merges until all checks pass, configure the following branch protection rules for the `main` branch:

### Via GitHub Web UI:
1. Go to: Settings → Branches → Add rule (or edit existing rule for `main`)
2. Configure the following settings:

#### Required Settings:
- ✅ **Require a pull request before merging**
  - ✅ Require approvals: 1
  - ✅ Dismiss stale PR approvals when new commits are pushed
  - ✅ Require review from code owners (if CODEOWNERS file exists)

- ✅ **Require status checks to pass before merging**
  - ✅ Require branches to be up to date before merging
  - ✅ Required status checks:
    - `test (18.x)` - Node.js 18 tests
    - `test (20.x)` - Node.js 20 tests
    - `test (22.x)` - Node.js 22 tests

#### Optional but Recommended:
- ✅ **Require conversation resolution before merging**
- ✅ **Require signed commits**
- ✅ **Include administrators** (applies rules to repo admins too)
- ✅ **Allow force pushes** - ❌ (keep disabled for security)
- ✅ **Allow deletions** - ❌ (keep disabled for security)

### Via GitHub CLI:
```bash
# Enable branch protection with required status checks
gh api repos/:owner/:repo/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["test (18.x)","test (20.x)","test (22.x)"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true}' \
  --field restrictions=null
```

## How This Solves the Issue

Once branch protection is enabled:
1. **PRs cannot be merged** until all required status checks pass
2. **Status checks include**: All Node.js version tests (18.x, 20.x, 22.x)
3. **Coverage threshold**: Must be ≥75% or CI fails
4. **Test failures**: Will block the merge
5. **Up-to-date requirement**: Branch must be current with main

## Current CI Workflow Status

The existing `.github/workflows/test.yml` already:
- ✅ Runs tests on Node.js 18, 20, 22
- ✅ Enforces 75% coverage threshold
- ✅ Fails if tests fail or coverage is low
- ✅ Reports status to GitHub

## Verification

After enabling branch protection, test by:
1. Creating a PR with failing tests
2. Verifying the "Merge" button is disabled
3. Fixing the tests
4. Verifying the "Merge" button becomes available

## Alternative: Stricter Enforcement

If you want to prevent merging even when tests pass (unusual requirement), you could:
1. Add a workflow that always fails
2. Require manual admin override for every merge
3. Use a different branching strategy

## Contact

If you need help configuring these settings, repository administrators can access:
- **Settings** → **Branches** → **Add rule** (for `main` branch)