# EverMemory Rollback Procedure

## Purpose

This procedure provides step-by-step commands for safely rolling back EverMemory when issues occur after enablement or during a release. It is designed to be executed by a single operator without specialized knowledge.

All commands are copy-pasteable and follow a conservative, evidence-preserving approach.

---

## Rollback Principles

1. **Stop the bleeding first** - Restore service before investigating root cause
2. **Preserve evidence** - Do not delete databases or logs during initial rollback
3. **Incremental rollback** - Use the minimum level needed to restore service
4. **Verify each step** - Confirm each rollback action before proceeding
5. **Document everything** - Record all actions and observations

---

## When to Rollback

Execute rollback when:

- Gateway fails to start or restart after EverMemory enablement
- `evermemory_status`, `evermemory_store`, or `evermemory_recall` tools are unstable or failing
- Database path configuration errors cause data loss or corruption
- Memory provider behavior is incorrect or degraded
- Release validation fails and cannot be fixed quickly
- Production traffic is impacted by EverMemory issues
- Same issue occurs repeatedly (2+ times)

---

## Rollback Decision Criteria

### Severity Levels

**Critical (Immediate Rollback Required):**
- Gateway cannot start or crashes repeatedly
- Data corruption or loss detected
- Security baseline regression (critical/warn levels increased)
- Production traffic completely blocked

**High (Rollback Within 1 Hour):**
- Tools failing intermittently
- Performance degradation >50%
- Memory recall accuracy <80%
- Multiple operator reports of issues

**Medium (Rollback Within 4 Hours):**
- Non-critical tool failures
- Performance degradation 20-50%
- Memory recall accuracy 80-90%
- Workarounds available but not sustainable

**Low (Investigate Before Rollback):**
- Minor issues with workarounds
- Performance degradation <20%
- Memory recall accuracy >90%
- Issues isolated to specific use cases

---

## Rollback Levels

Use the minimum rollback level needed to restore service.

### Level 1: Unbind Memory Slot (Least Disruptive)

**Impact:** EverMemory stops receiving default memory traffic but remains loaded for diagnostics.

**Use when:**
- Plugin loads successfully but behavior is incorrect
- You want to quickly switch back to previous memory provider
- You need to keep plugin loaded for investigation

**Rollback time:** ~2 minutes

---

### Level 2: Disable Plugin Entry (Moderate Disruption)

**Impact:** EverMemory plugin stops initializing and running.

**Use when:**
- Plugin initialization causes gateway issues
- Level 1 rollback did not resolve the issue
- You need to completely stop plugin execution

**Rollback time:** ~3 minutes

---

### Level 3: Remove Plugin Discovery Path (Most Disruptive)

**Impact:** OpenClaw completely stops discovering EverMemory package.

**Use when:**
- Plugin package is corrupted or has build issues
- Level 2 rollback did not resolve the issue
- You need complete removal for troubleshooting
- Preparing for clean reinstall

**Rollback time:** ~5 minutes

---

## Pre-Rollback Evidence Collection

Before making any changes, collect evidence for post-mortem analysis.

### 1. Gateway Status

```bash
openclaw gateway status
```

Save output to a file:

```bash
openclaw gateway status > /tmp/evermemory-rollback-gateway-status-$(date +%Y%m%d-%H%M%S).txt
```

---

### 2. Plugin Status

```bash
openclaw plugins info evermemory
```

Save output:

```bash
openclaw plugins info evermemory > /tmp/evermemory-rollback-plugin-status-$(date +%Y%m%d-%H%M%S).txt
```

---

### 3. Environment Health

```bash
cd /root/.openclaw/workspace/projects/evermemory
npm run doctor
npm run check
```

Save output:

```bash
npm run doctor > /tmp/evermemory-rollback-doctor-$(date +%Y%m%d-%H%M%S).txt 2>&1
npm run check > /tmp/evermemory-rollback-check-$(date +%Y%m%d-%H%M%S).txt 2>&1
```

---

### 4. Database Status

Check database file:

```bash
ls -la /root/.openclaw/memory/evermemory/store/evermemory.db
```

Find all database copies:

```bash
find /root -name 'evermemory.db' 2>/dev/null
```

Save output:

```bash
find /root -name 'evermemory.db' 2>/dev/null > /tmp/evermemory-rollback-db-locations-$(date +%Y%m%d-%H%M%S).txt
```

---

### 5. Recent Logs (If Available)

If OpenClaw provides logs, capture recent entries:

```bash
# Adjust path based on your OpenClaw installation
tail -n 100 ~/.openclaw/logs/gateway.log > /tmp/evermemory-rollback-logs-$(date +%Y%m%d-%H%M%S).txt
```

---

### 6. Current Configuration

Backup current OpenClaw configuration:

```bash
cp ~/.openclaw/openclaw.json /tmp/evermemory-rollback-config-backup-$(date +%Y%m%d-%H%M%S).json
```

---

## Level 1 Rollback: Unbind Memory Slot

### Step 1: Identify Current Memory Slot Binding

Check current configuration:

```bash
grep -A 5 '"slots"' ~/.openclaw/openclaw.json
```

**Expected output:**
```json
"slots": {
  "memory": "evermemory"
}
```

---

### Step 2: Update Configuration

Edit `~/.openclaw/openclaw.json`:

**Option A: Switch to previous memory provider**

Change:
```json
{
  "plugins": {
    "slots": {
      "memory": "evermemory"
    }
  }
}
```

To:
```json
{
  "plugins": {
    "slots": {
      "memory": "<previous-memory-plugin>"
    }
  }
}
```

**Option B: Remove memory slot binding**

Change:
```json
{
  "plugins": {
    "slots": {
      "memory": "evermemory"
    }
  }
}
```

To:
```json
{
  "plugins": {
    "slots": {}
  }
}
```

---

### Step 3: Restart Gateway

```bash
openclaw gateway restart
```

**Expected output:** Gateway restarts successfully.

---

### Step 4: Verify Rollback

Check gateway status:

```bash
openclaw gateway status
```

**Expected result:**
- `Runtime: running`
- `RPC probe: ok`

Check plugin status:

```bash
openclaw plugins info evermemory
```

**Expected result:** Plugin may still show as loaded, but not bound to memory slot.

---

### Step 5: Test Basic Functionality

Test that OpenClaw is operational:

```bash
# Test basic gateway functionality
openclaw gateway status
```

If previous memory provider was restored, test it according to its documentation.

---

### Step 6: Document Rollback

Record rollback action:

```bash
echo "Level 1 rollback completed at $(date)" >> /tmp/evermemory-rollback-log.txt
echo "Memory slot unbound from evermemory" >> /tmp/evermemory-rollback-log.txt
```

---

## Level 2 Rollback: Disable Plugin Entry

### Step 1: Update Configuration

Edit `~/.openclaw/openclaw.json`:

Change:
```json
{
  "plugins": {
    "entries": {
      "evermemory": {
        "enabled": true
      }
    }
  }
}
```

To:
```json
{
  "plugins": {
    "entries": {
      "evermemory": {
        "enabled": false
      }
    }
  }
}
```

---

### Step 2: Restart Gateway

```bash
openclaw gateway restart
```

**Expected output:** Gateway restarts successfully.

---

### Step 3: Verify Rollback

Check gateway status:

```bash
openclaw gateway status
```

**Expected result:**
- `Runtime: running`
- `RPC probe: ok`

Check plugin status:

```bash
openclaw plugins info evermemory
```

**Expected result:** Plugin shows as disabled or not loaded.

---

### Step 4: Verify Tools Are Unavailable

Attempt to use EverMemory tool (should fail):

```bash
# This should fail or show tool not available
openclaw tools list | grep evermemory
```

**Expected result:** No EverMemory tools listed.

---

### Step 5: Document Rollback

```bash
echo "Level 2 rollback completed at $(date)" >> /tmp/evermemory-rollback-log.txt
echo "Plugin entry disabled" >> /tmp/evermemory-rollback-log.txt
```

---

## Level 3 Rollback: Remove Plugin Discovery Path

### Step 1: Update Configuration

Edit `~/.openclaw/openclaw.json`:

Change:
```json
{
  "plugins": {
    "load": {
      "paths": [
        "/root/.openclaw/workspace/projects/evermemory",
        "/other/plugin/path"
      ]
    }
  }
}
```

To:
```json
{
  "plugins": {
    "load": {
      "paths": [
        "/other/plugin/path"
      ]
    }
  }
}
```

Remove the EverMemory path from the array.

---

### Step 2: Restart Gateway

```bash
openclaw gateway restart
```

**Expected output:** Gateway restarts successfully.

---

### Step 3: Verify Rollback

Check gateway status:

```bash
openclaw gateway status
```

**Expected result:**
- `Runtime: running`
- `RPC probe: ok`

Check plugin status:

```bash
openclaw plugins info evermemory
```

**Expected result:** Plugin not found or not discoverable.

---

### Step 4: Document Rollback

```bash
echo "Level 3 rollback completed at $(date)" >> /tmp/evermemory-rollback-log.txt
echo "Plugin discovery path removed" >> /tmp/evermemory-rollback-log.txt
```

---

## Database Preservation

### Default Behavior: Preserve Database

**Do not delete the database during rollback** unless explicitly required for data corruption issues.

Database location (default):
```
/root/.openclaw/memory/evermemory/store/evermemory.db
```

**Reasons to preserve:**
- Evidence for post-mortem analysis
- Enables re-enablement without data loss
- Supports data export/migration if needed

---

### Database Backup (Optional)

If you need to preserve database state before potential changes:

```bash
cp /root/.openclaw/memory/evermemory/store/evermemory.db \
   /tmp/evermemory-db-backup-$(date +%Y%m%d-%H%M%S).db
```

---

### Database Deletion (Only If Required)

**Warning:** Only delete database if:
- Data corruption is confirmed
- Fresh start is explicitly required
- Backup has been created
- Approval has been obtained

```bash
# Backup first
cp /root/.openclaw/memory/evermemory/store/evermemory.db \
   /tmp/evermemory-db-backup-$(date +%Y%m%d-%H%M%S).db

# Then delete
rm /root/.openclaw/memory/evermemory/store/evermemory.db
```

---

## Post-Rollback Verification

### 1. Gateway Health

```bash
openclaw gateway status
```

**Required result:**
- `Runtime: running`
- `RPC probe: ok`

---

### 2. Plugin Status

```bash
openclaw plugins info evermemory
```

**Expected result depends on rollback level:**
- Level 1: May still show loaded, but not bound to memory slot
- Level 2: Shows disabled or not running
- Level 3: Not found or not discoverable

---

### 3. Memory Provider Status

If you switched to a previous memory provider, verify it is working:

```bash
# Test according to your previous memory provider's documentation
```

---

### 4. Database Preservation

```bash
ls -la /root/.openclaw/memory/evermemory/store/evermemory.db
```

**Expected result:** Database file still exists (unless explicitly deleted).

---

### 5. Evidence Archive

Verify all evidence was collected:

```bash
ls -lt /tmp/evermemory-rollback-* | head -10
```

---

## Re-Enablement After Rollback

If issues are resolved and you want to re-enable EverMemory:

### Step 1: Verify Fix

Ensure the root cause has been addressed:

```bash
cd /root/.openclaw/workspace/projects/evermemory
npm run doctor
npm run check
npm run test:unit
```

All checks must pass.

---

### Step 2: Reverse Rollback (Level 3 → Level 2 → Level 1 → Enabled)

**From Level 3 to Level 2:**

Add plugin path back to `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "load": {
      "paths": [
        "/root/.openclaw/workspace/projects/evermemory"
      ]
    }
  }
}
```

Restart gateway:

```bash
openclaw gateway restart
```

---

**From Level 2 to Level 1:**

Enable plugin entry in `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "evermemory": {
        "enabled": true
      }
    }
  }
}
```

Restart gateway:

```bash
openclaw gateway restart
```

---

**From Level 1 to Enabled:**

Bind memory slot in `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "slots": {
      "memory": "evermemory"
    }
  }
}
```

Restart gateway:

```bash
openclaw gateway restart
```

---

### Step 3: Run Smoke Test

```bash
cd /root/.openclaw/workspace/projects/evermemory
npm run test:openclaw:smoke
```

**Expected result:** Smoke test passes.

---

### Step 4: Monitor

Monitor gateway and plugin for at least 15 minutes after re-enablement:

```bash
# Check every 5 minutes
openclaw gateway status
openclaw plugins info evermemory
```

---

## Rollback Scenarios and Recommended Levels

| Scenario | Recommended Level | Rationale |
|----------|-------------------|-----------|
| Incorrect memory behavior | Level 1 | Quick switch, preserves diagnostics |
| Gateway startup failure | Level 2 | Plugin initialization is the issue |
| Build/package corruption | Level 3 | Need clean package state |
| Database path misconfiguration | Level 1 | Config issue, not plugin issue |
| Performance degradation | Level 1 | Quick mitigation, investigate later |
| Security baseline regression | Level 2 | Stop execution, investigate |
| Data corruption | Level 2 + DB backup | Preserve evidence, stop writes |
| Release validation failure | Level 1 or 2 | Depends on failure type |

---

## Actions to Avoid

### Do Not Delete Database First

**Risk:**
- Lose evidence for root cause analysis
- Lose real user data
- Cannot distinguish between path errors and data corruption

**Correct approach:** Preserve database, investigate, then decide.

---

### Do Not Change Multiple Levels at Once

**Risk:**
- Cannot determine which action resolved the issue
- Difficult to create repeatable procedures
- Harder to re-enable incrementally

**Correct approach:** Use minimum rollback level, verify, escalate if needed.

---

### Do Not Skip Gateway Restart

**Risk:**
- Configuration changes not applied
- False negative on rollback success
- Confusion about current state

**Correct approach:** Always restart gateway after config changes.

---

### Do Not Skip Evidence Collection

**Risk:**
- Cannot perform root cause analysis
- Cannot prevent recurrence
- Cannot improve procedures

**Correct approach:** Collect evidence before making changes.

---

## Quick Reference: Minimum Rollback SOP

### Emergency Rollback (2 Minutes)

```bash
# 1. Unbind memory slot in ~/.openclaw/openclaw.json
# Change "memory": "evermemory" to "memory": "<previous-provider>"

# 2. Restart gateway
openclaw gateway restart

# 3. Verify
openclaw gateway status

# 4. If still failing, disable plugin entry
# Change "enabled": true to "enabled": false in evermemory entry

# 5. Restart again
openclaw gateway restart

# 6. Verify
openclaw gateway status

# 7. Preserve database - do not delete
ls -la /root/.openclaw/memory/evermemory/store/evermemory.db
```

---

### Complete Removal (5 Minutes)

```bash
# 1. Unbind memory slot
# 2. Disable plugin entry
# 3. Remove plugin path from load.paths
# 4. Restart gateway
openclaw gateway restart

# 5. Verify complete removal
openclaw plugins info evermemory  # Should show not found

# 6. Verify gateway health
openclaw gateway status

# 7. Preserve database and evidence
ls -la /root/.openclaw/memory/evermemory/store/evermemory.db
ls -lt /tmp/evermemory-rollback-*
```

---

## Evidence Reference Standards

All rollback actions should generate evidence files in `/tmp/` with timestamps:

- `evermemory-rollback-gateway-status-*.txt`
- `evermemory-rollback-plugin-status-*.txt`
- `evermemory-rollback-doctor-*.txt`
- `evermemory-rollback-check-*.txt`
- `evermemory-rollback-db-locations-*.txt`
- `evermemory-rollback-logs-*.txt`
- `evermemory-rollback-config-backup-*.json`
- `evermemory-rollback-log.txt`

Archive these files for post-mortem analysis:

```bash
mkdir -p .openclaw/reports/rollback-$(date +%Y%m%d-%H%M%S)
mv /tmp/evermemory-rollback-* .openclaw/reports/rollback-$(date +%Y%m%d-%H%M%S)/
```

---

## Related Documentation

- Installation guide: `docs/evermemory-installation-guide.md`
- Troubleshooting guide: `docs/evermemory-troubleshooting.md`
- Operator runbook: `docs/evermemory-operator-runbook.md`
- Release checklist: `docs/evermemory-release-checklist.md`
- Quickstart guide: `docs/evermemory-quickstart.md`
