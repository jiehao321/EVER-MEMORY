# EverMemory Release Checklist

## Purpose

This checklist provides a step-by-step, command-level procedure for executing a release. It is designed to be followed by a single operator without requiring specialized knowledge.

All commands are copy-pasteable and validated against the 0.0.1 release baseline.

---

## Prerequisites

Before starting the release process:

1. Ensure you have Node 22.x installed (check with `node --version`)
2. Ensure OpenClaw gateway is running and accessible
3. Ensure you have write access to the release branch
4. Ensure you have the necessary credentials for package distribution (if applicable)

---

## Phase 1: Pre-Release Validation

### 1.1 Branch and Working Tree Guard

Switch to the release branch (never use `main`):

```bash
git checkout release/<version>
```

Run the branch/working tree guard:

```bash
npm run repo:guard
```

**Expected result:** Guard passes with no uncommitted changes and confirms you are not on `main`.

**If guard fails:**
- Commit or stash uncommitted changes
- Verify you are on the correct release branch
- Do not proceed until guard passes

---

### 1.2 Environment Health Check

Run the environment doctor:

```bash
npm run doctor
```

**Expected result:** Node version check passes, SQLite native module probe succeeds.

**If doctor fails:**
- Verify Node version is 22.x
- Run `npm rebuild better-sqlite3` if SQLite probe fails
- Re-run `npm run doctor` until it passes

---

### 1.3 Type Check and Build

Run type checking:

```bash
npm run check
```

**Expected result:** No TypeScript errors.

Run build:

```bash
npm run build
```

**Expected result:** `dist/` directory created with compiled output.

---

### 1.4 Unit Tests

Run unit tests:

```bash
npm run test:unit
```

**Expected result:** All unit tests pass.

**If tests fail:**
- Review test output for failures
- Fix issues before proceeding
- Do not skip failing tests

---

### 1.5 Agent Teams Development Gate

Run the development gate:

```bash
npm run teams:dev
```

**Expected result:** All development checks pass.

**If gate fails:**
- Review the failure report
- Address issues identified by the gate
- Re-run until it passes

---

### 1.6 Agent Teams Release Gate

Run the release gate:

```bash
npm run teams:release
```

**Expected result:** All release checks pass with `GO` status.

**If gate fails:**
- Review the failure report
- This is a blocking failure - do not proceed
- Address all issues before continuing

---

### 1.7 OpenClaw Soak Test

Run the soak validation:

```bash
npm run test:openclaw:soak
```

**Expected result:** All iterations complete successfully with no errors.

**If soak fails:**
- Review the failure output
- Check OpenClaw gateway status: `openclaw gateway status`
- Check plugin status: `openclaw plugins info evermemory`
- Address issues before proceeding

---

### 1.8 Feishu Qgent Dialogue E2E (Optional but Recommended)

Run the Feishu qgent dialogue test:

```bash
npm run test:openclaw:feishu-qgent
```

**Expected result:** Multi-turn dialogue completes with DB evidence.

**If test fails:**
- Review the failure output
- This test validates real-world continuity
- Consider addressing issues before release

---

### 1.9 Recall Benchmark

Run the recall quality benchmark:

```bash
npm run test:recall:benchmark
```

**Expected result:** Benchmark score meets or exceeds baseline (95%+ accuracy).
**Hard gate:** accuracy must be `>= 0.90` (script gate).  
**Release target:** accuracy should be `>= 0.95` for freeze release.

**If benchmark fails:**
- Review the benchmark report in `/tmp/evermemory-recall-benchmark-*.json`
- Investigate recall quality degradation
- Do not proceed if score is below `0.90`

---

### 1.10 Security Baseline Check

Run the security gate:

```bash
npm run test:openclaw:security
```

**Expected result:** Security baseline matches `config/openclaw-security-baseline.json` with no regressions.

**If security gate fails:**
- Review the security report
- Check for critical/warn level increases
- Run recovery if needed: `npm run openclaw:security:recover`
- Do not proceed with security regressions

---

## Phase 2: Parameter Freeze

### 2.1 Version Consistency Check

Verify version numbers are consistent across all files:

```bash
grep -E '"version"' package.json plugin.json openclaw.plugin.json
```

**Expected result:** All three files show the same version number (e.g., `0.0.1`).

**If versions mismatch:**
- Update all files to match the target release version
- Commit the version update
- Re-run `npm run repo:guard` to verify clean state

---

### 2.2 Configuration Freeze

Verify no configuration changes are pending:

```bash
git diff --name-only
```

**Expected result:** No output (clean working tree).

**If there are changes:**
- Review and commit necessary changes
- Ensure changes are intentional and documented
- Re-run `npm run repo:guard`

---

### 2.3 Dependency Lock

Verify `package-lock.json` is up to date:

```bash
npm install --package-lock-only
git diff package-lock.json
```

**Expected result:** No changes to `package-lock.json`.

**If lock file changes:**
- Review changes carefully
- Commit if changes are necessary
- Re-run validation suite

---

## Phase 3: Release Evaluation

### 3.1 Run Release Evaluation

Execute the release evaluation script:

```bash
npm run release:evaluate
```

**Expected result:** Evaluation completes with `GO` status and generates a report in `/tmp/evermemory-release-evaluate-*.json`.

**Report includes:**
- Branch guard status
- Type check status
- Unit test status
- Agent Teams release gate status
- OpenClaw soak status
- Recall benchmark status
- Security gate status
- Test data cleanup status

**If evaluation fails:**
- Review the evaluation report
- Address all failures
- Re-run evaluation until `GO` status is achieved
- Do not proceed to packing without `GO` status

---

### 3.2 Record Evaluation Evidence

Copy the evaluation report path:

```bash
ls -lt /tmp/evermemory-release-evaluate-*.json | head -1
```

Record this path in your release documentation (e.g., `docs/evermemory-release-<version>.md`).

---

## Phase 4: Release Packaging

### 4.1 Run Release Pack

Execute the release pack script:

```bash
npm run release:pack
```

**Expected result:** Pack completes successfully and generates:
- Package tarball in `/tmp/evermemory-release/evermemory-<version>.tgz`
- Pack report in `/tmp/evermemory-release-pack-*.json`

**If pack fails:**
- Review the pack report
- Verify build artifacts exist in `dist/`
- Address issues and re-run

---

### 4.2 Verify Package Contents

Inspect the package tarball:

```bash
tar -tzf /tmp/evermemory-release/evermemory-<version>.tgz | head -20
```

**Expected contents:**
- `package/dist/`
- `package/index.js`
- `package/openclaw.plugin.json`
- `package/plugin.json`
- `package/README.md`
- `package/docs/evermemory-installation-guide.md`

**If contents are incorrect:**
- Review `package.json` `files` field
- Re-run build and pack

---

### 4.3 Record Package Evidence

Record the package path and pack report path in your release documentation.

---

## Phase 5: Evidence Collection

### 5.1 Collect All Report Paths

Gather all evidence files:

```bash
ls -lt /tmp/evermemory-* | head -10
```

**Required evidence:**
- Release evaluation report
- Release pack report
- Recall benchmark report
- Soak test report (if available)
- Security gate report (if available)

---

### 5.2 Update Release Documentation

Update the release document (e.g., `docs/evermemory-release-<version>.md`) with:
- Evaluation status: `GO`
- Pack status: `PASS`
- All report paths
- Package tarball path
- Timestamp of release completion

---

## Phase 6: Test Data Cleanup

### 6.1 Clean Test Artifacts

Run the test data cleanup:

```bash
npm run openclaw:cleanup:test-data
```

**Expected result:** Cleanup completes with summary of deleted records.

**If cleanup fails:**
- Review the error output
- Verify OpenClaw gateway is running
- Verify database path is correct
- Re-run cleanup

---

### 6.2 Verify Cleanup

Run cleanup again to verify no test data remains:

```bash
npm run openclaw:cleanup:test-data
```

**Expected result:** `totalDeleted=0` (no test data found).

---

## Phase 7: Final Verification

### 7.1 Working Tree Check

Verify working tree is clean:

```bash
git status --short
```

**Expected result:** No output (clean working tree).

**If there are changes:**
- Review changes
- Commit if necessary
- Re-run `npm run repo:guard`

---

### 7.2 Plugin Version Check

Verify plugin version in OpenClaw:

```bash
openclaw plugins info evermemory
```

**Expected result:** Version matches release version.

---

### 7.3 Gateway Health Check

Verify gateway is healthy:

```bash
openclaw gateway status
```

**Expected result:**
- `Runtime: running`
- `RPC probe: ok`

---

## Phase 8: Sign-Off Requirements

### 8.1 Release Checklist Sign-Off

Confirm all items are complete:

- [ ] Branch guard passed
- [ ] Environment health check passed
- [ ] Type check and build passed
- [ ] Unit tests passed
- [ ] Agent Teams dev gate passed
- [ ] Agent Teams release gate passed
- [ ] OpenClaw soak test passed
- [ ] Recall benchmark passed (>=0.90 hard gate, >=0.95 release target)
- [ ] Security baseline check passed
- [ ] Version consistency verified
- [ ] Release evaluation: `GO`
- [ ] Release pack: `PASS`
- [ ] Package contents verified
- [ ] All evidence collected and recorded
- [ ] Test data cleanup completed
- [ ] Working tree clean
- [ ] Plugin version verified
- [ ] Gateway health verified

---

### 8.2 Release Approval

**Approver:** (Name and role)

**Approval Date:** (YYYY-MM-DD)

**Approval Signature:** (Digital signature or approval ticket reference)

---

## Phase 9: Release Finalization

### 9.1 Tag Release

Create a git tag for the release:

```bash
git tag -a v<version> -m "Release <version>"
```

---

### 9.2 Push Release Branch

Push the release branch to remote:

```bash
git push origin release/<version>
```

---

### 9.3 Push Tag

Push the release tag to remote:

```bash
git push origin v<version>
```

---

### 9.4 Merge to Main

Create a pull request to merge the release branch into `main`:

1. Go to your repository's PR interface
2. Create PR from `release/<version>` to `main`
3. Include release evidence in PR description
4. Wait for review and approval
5. Merge PR (do not force push to `main`)

---

## Post-Release

### Archive Evidence

Move all evidence files to a permanent archive location:

```bash
mkdir -p .openclaw/reports/release-<version>
cp /tmp/evermemory-release-evaluate-*.json .openclaw/reports/release-<version>/
cp /tmp/evermemory-release-pack-*.json .openclaw/reports/release-<version>/
cp /tmp/evermemory-recall-benchmark-*.json .openclaw/reports/release-<version>/
cp /tmp/evermemory-openclaw-soak-*.json .openclaw/reports/release-<version>/
```

---

## Troubleshooting

If any step fails, refer to:
- `docs/evermemory-troubleshooting.md` for common issues
- `docs/evermemory-operator-runbook.md` for operational guidance
- `docs/evermemory-rollback-procedure.md` if rollback is needed

---

## Related Documentation

- Release quality checklist: `docs/evermemory-release-quality-checklist.md`
- Branch and release governance: `docs/evermemory-branch-and-release-governance.md`
- Operator runbook: `docs/evermemory-operator-runbook.md`
- Rollback procedure: `docs/evermemory-rollback-procedure.md`
