#!/bin/bash
# ScoutGPT Autonomous Run
# Runs: database audit, bbox fix, server tests, live monitoring dashboard
# Usage: bash scripts/autonomous-run.sh

set -euo pipefail

BASEDIR=~/scoutgpt-api
AUDIT_DIR="$BASEDIR/audits"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOGFILE="$AUDIT_DIR/autonomous-run-$TIMESTAMP.log"
STATUS_FILE="$AUDIT_DIR/status.json"
DASHBOARD_PORT=8888
DASHBOARD_PID=""
SERVER_PID=""

mkdir -p "$AUDIT_DIR"
mkdir -p "$BASEDIR/scripts"

# ─── Status tracking ───────────────────────────────────────────────
update_status() {
  local step="$1"
  local status="$2"
  local detail="${3:-}"
  local now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  cat > "$STATUS_FILE" << STATUSEOF
{
  "current_step": "$step",
  "status": "$status",
  "detail": "$detail",
  "updated_at": "$now",
  "log_file": "$LOGFILE",
  "steps": {
    "audit": "${STEP_AUDIT:-pending}",
    "bbox_fix": "${STEP_BBOX:-pending}",
    "server_test": "${STEP_SERVER:-pending}",
    "complete": "${STEP_COMPLETE:-pending}"
  }
}
STATUSEOF
}

# ─── Cleanup on exit ──────────────────────────────────────────────
cleanup() {
  echo "Cleaning up..." | tee -a "$LOGFILE"
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    echo "Server stopped" | tee -a "$LOGFILE"
  fi
  if [ -n "$DASHBOARD_PID" ] && kill -0 "$DASHBOARD_PID" 2>/dev/null; then
    kill "$DASHBOARD_PID" 2>/dev/null || true
    echo "Dashboard stopped" | tee -a "$LOGFILE"
  fi
}
trap cleanup EXIT

# ─── Create dashboard HTML ────────────────────────────────────────
cat > "$AUDIT_DIR/dashboard.html" << 'HTMLEOF'
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ScoutGPT Autonomous Run</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { 
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    background: #0a0e14; color: #b3b1ad; min-height: 100vh; padding: 24px;
  }
  .header { 
    border-bottom: 1px solid #1f2430; padding-bottom: 16px; margin-bottom: 24px;
  }
  .header h1 { 
    font-size: 18px; color: #e6e1cf; font-weight: 600;
    letter-spacing: 0.5px;
  }
  .header .time { font-size: 12px; color: #626a73; margin-top: 4px; }
  .steps { 
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
    margin-bottom: 24px;
  }
  .step { 
    background: #0d1117; border: 1px solid #1f2430; border-radius: 8px;
    padding: 16px; text-align: center;
  }
  .step .label { font-size: 11px; color: #626a73; text-transform: uppercase; letter-spacing: 1px; }
  .step .status { font-size: 14px; margin-top: 8px; font-weight: 600; }
  .step.pending .status { color: #626a73; }
  .step.running .status { color: #f5a623; }
  .step.running { border-color: #f5a623; box-shadow: 0 0 12px rgba(245,166,35,0.15); }
  .step.pass .status { color: #7ec699; }
  .step.pass { border-color: #2d4a3e; }
  .step.fail .status { color: #f07178; }
  .step.fail { border-color: #4a2d2d; }
  .detail-box {
    background: #0d1117; border: 1px solid #1f2430; border-radius: 8px;
    padding: 12px 16px; margin-bottom: 24px; font-size: 13px; color: #e6e1cf;
  }
  .log-container {
    background: #0d1117; border: 1px solid #1f2430; border-radius: 8px;
    padding: 16px; max-height: 60vh; overflow-y: auto;
  }
  .log-container h2 { 
    font-size: 13px; color: #626a73; margin-bottom: 12px;
    text-transform: uppercase; letter-spacing: 1px;
  }
  .log-content { 
    font-size: 12px; line-height: 1.6; white-space: pre-wrap; 
    word-break: break-all; color: #b3b1ad;
  }
  .log-content .pass { color: #7ec699; }
  .log-content .fail { color: #f07178; }
  .log-content .step-header { color: #f5a623; font-weight: 600; }
  .pulse { animation: pulse 2s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
</style>
</head>
<body>
<div class="header">
  <h1>ScoutGPT — Autonomous Run Monitor</h1>
  <div class="time" id="lastUpdate">Connecting...</div>
</div>

<div class="steps" id="steps">
  <div class="step pending" id="step-audit">
    <div class="label">Step 1</div>
    <div class="status">Database Audit</div>
  </div>
  <div class="step pending" id="step-bbox_fix">
    <div class="label">Step 2</div>
    <div class="status">BBox Fix</div>
  </div>
  <div class="step pending" id="step-server_test">
    <div class="label">Step 3</div>
    <div class="status">Server Tests</div>
  </div>
  <div class="step pending" id="step-complete">
    <div class="label">Step 4</div>
    <div class="status">Complete</div>
  </div>
</div>

<div class="detail-box" id="detail">Waiting for status...</div>

<div class="log-container">
  <h2>Live Log</h2>
  <div class="log-content" id="logContent">Loading...</div>
</div>

<script>
function statusClass(s) {
  if (s === 'running') return 'running';
  if (s === 'pass' || s === 'done') return 'pass';
  if (s === 'fail') return 'fail';
  return 'pending';
}

async function refresh() {
  try {
    // Fetch status
    const statusResp = await fetch('/status.json?' + Date.now());
    if (statusResp.ok) {
      const data = await statusResp.json();
      document.getElementById('lastUpdate').textContent = 
        'Last update: ' + new Date(data.updated_at).toLocaleTimeString();
      document.getElementById('detail').textContent = 
        data.current_step + ': ' + data.status + (data.detail ? ' — ' + data.detail : '');
      
      for (const [key, val] of Object.entries(data.steps)) {
        const el = document.getElementById('step-' + key);
        if (el) {
          el.className = 'step ' + statusClass(val);
          if (val === 'running') el.querySelector('.status').classList.add('pulse');
          else el.querySelector('.status').classList.remove('pulse');
        }
      }
    }
  } catch(e) {}

  try {
    // Fetch log
    const logResp = await fetch('/log.txt?' + Date.now());
    if (logResp.ok) {
      let text = await logResp.text();
      // Colorize
      text = text.replace(/(✅.*)/g, '<span class="pass">$1</span>');
      text = text.replace(/(❌.*)/g, '<span class="fail">$1</span>');
      text = text.replace(/(--- STEP.*---)/g, '<span class="step-header">$1</span>');
      const el = document.getElementById('logContent');
      el.innerHTML = text;
      el.scrollTop = el.scrollHeight;
    }
  } catch(e) {}
}

setInterval(refresh, 3000);
refresh();
</script>
</body>
</html>
HTMLEOF

# ─── Start dashboard server ──────────────────────────────────────
# Simple HTTP server using Node.js (no dependencies needed)
cat > "$AUDIT_DIR/dashboard-server.js" << 'SERVEREOF'
const http = require('http');
const fs = require('fs');
const path = require('path');

const dir = path.join(process.env.HOME, 'scoutgpt-api', 'audits');
const port = parseInt(process.argv[2] || '8888');

const mimeTypes = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.txt': 'text/plain',
};

http.createServer((req, res) => {
  let filePath;
  const url = req.url.split('?')[0]; // strip query params

  if (url === '/' || url === '/index.html') {
    filePath = path.join(dir, 'dashboard.html');
  } else if (url === '/status.json') {
    filePath = path.join(dir, 'status.json');
  } else if (url === '/log.txt') {
    // Find the most recent log file
    try {
      const files = fs.readdirSync(dir)
        .filter(f => f.startsWith('autonomous-run-') && f.endsWith('.log'))
        .sort()
        .reverse();
      filePath = files.length > 0 ? path.join(dir, files[0]) : null;
    } catch(e) {
      filePath = null;
    }
  }

  if (!filePath || !fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'text/plain';
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.writeHead(200, { 
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(content);
  } catch(e) {
    res.writeHead(500);
    res.end('Error reading file');
  }
}).listen(port, '0.0.0.0', () => {
  console.log(`Dashboard: http://0.0.0.0:${port}`);
});
SERVEREOF

echo "=== ScoutGPT Autonomous Run ===" | tee "$LOGFILE"
echo "Started: $(date)" | tee -a "$LOGFILE"
echo "" | tee -a "$LOGFILE"

# Start dashboard
STEP_AUDIT="pending"; STEP_BBOX="pending"; STEP_SERVER="pending"; STEP_COMPLETE="pending"
update_status "init" "starting" "Launching dashboard server"

node "$AUDIT_DIR/dashboard-server.js" $DASHBOARD_PORT &
DASHBOARD_PID=$!
sleep 1
echo "Dashboard running at http://0.0.0.0:$DASHBOARD_PORT (PID: $DASHBOARD_PID)" | tee -a "$LOGFILE"
echo "" | tee -a "$LOGFILE"

# ─── STEP 1: Database Audit ──────────────────────────────────────
echo "--- STEP 1: Database Audit ---" | tee -a "$LOGFILE"
STEP_AUDIT="running"
update_status "audit" "running" "Querying all 14 ATTOM tables"

cd "$BASEDIR"
if node audits/run-audit.js 2>&1 | tee -a "$LOGFILE"; then
  if [ -f "$AUDIT_DIR/neon-data-audit.md" ]; then
    echo "✅ Audit complete. Output: $AUDIT_DIR/neon-data-audit.md" | tee -a "$LOGFILE"
    STEP_AUDIT="pass"
    update_status "audit" "pass" "neon-data-audit.md generated"
  else
    echo "❌ Audit script ran but no output file" | tee -a "$LOGFILE"
    STEP_AUDIT="fail"
    update_status "audit" "fail" "No output file generated"
  fi
else
  echo "❌ Audit script failed" | tee -a "$LOGFILE"
  STEP_AUDIT="fail"
  update_status "audit" "fail" "Script exited with error"
fi
echo "" | tee -a "$LOGFILE"

# ─── STEP 2: Fix bbox bug (BUG-001) ─────────────────────────────
echo "--- STEP 2: Fix bbox bug (BUG-001) ---" | tee -a "$LOGFILE"
STEP_BBOX="running"
update_status "bbox_fix" "running" "Patching queryBuilder.js line 181"

# Backup
cp "$BASEDIR/services/queryBuilder.js" "$BASEDIR/services/queryBuilder.js.bak"
echo "Backup: queryBuilder.js.bak" | tee -a "$LOGFILE"

# Apply fix
node -e "
const fs = require('fs');
const file = fs.readFileSync('services/queryBuilder.js', 'utf8');

const oldCode = '      const parts = spatial.bbox.split(\",\").map(Number);';

// Also try with single quotes in case
const oldCodeAlt = \"      const parts = spatial.bbox.split(',').map(Number);\";

let target = null;
if (file.includes(oldCode)) target = oldCode;
else if (file.includes(oldCodeAlt)) target = oldCodeAlt;

if (!target) {
  console.log('WARNING: Could not find exact bbox code to replace.');
  console.log('Searching for similar patterns...');
  const lines = file.split('\n');
  lines.forEach((line, i) => {
    if (line.includes('bbox') && line.includes('split')) {
      console.log('Found at line ' + (i+1) + ': ' + line.trim());
    }
  });
  process.exit(1);
}

const newCode = '      // BUG-001 fix: handle bbox as array or comma-separated string\n      const parts = Array.isArray(spatial.bbox)\n        ? spatial.bbox.map(Number)\n        : String(spatial.bbox).split(\",\").map(Number);';

const updated = file.replace(target, newCode);
fs.writeFileSync('services/queryBuilder.js', updated);
console.log('✅ bbox fix applied');
" 2>&1 | tee -a "$LOGFILE"

if [ $? -eq 0 ]; then
  STEP_BBOX="pass"
  update_status "bbox_fix" "pass" "queryBuilder.js patched"
  # Show the fix
  echo "Verification:" | tee -a "$LOGFILE"
  grep -n -A3 "BUG-001" "$BASEDIR/services/queryBuilder.js" | tee -a "$LOGFILE"
else
  STEP_BBOX="fail"
  update_status "bbox_fix" "fail" "Patch failed — manual fix needed"
fi
echo "" | tee -a "$LOGFILE"

# ─── STEP 3: Server Tests ────────────────────────────────────────
echo "--- STEP 3: Server Start + Validation Tests ---" | tee -a "$LOGFILE"
STEP_SERVER="running"
update_status "server_test" "running" "Starting API server"

cd "$BASEDIR"
node server.js &
SERVER_PID=$!
echo "Server starting (PID: $SERVER_PID)..." | tee -a "$LOGFILE"
sleep 6

# Check if server is actually running
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "❌ Server failed to start" | tee -a "$LOGFILE"
  STEP_SERVER="fail"
  update_status "server_test" "fail" "Server crashed on startup"
else
  TEST_PASS=0
  TEST_FAIL=0

  # Test 1: property_search with bbox as ARRAY
  echo "Test 1: property_search with bbox ARRAY..." | tee -a "$LOGFILE"
  update_status "server_test" "running" "Test 1: bbox array"
  RESULT=$(curl -s --max-time 30 -X POST http://localhost:3001/api/chat \
    -H "Content-Type: application/json" \
    -d '{"messages":[{"role":"user","content":"Show me commercial properties in 78704"}], "context":{"bbox":[-97.8,30.2,-97.7,30.35]}}' 2>&1) || RESULT="CURL_FAILED"

  if echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); c=len(d.get('properties',[])); print(f'Results: {c} properties'); exit(0 if c>0 else 1)" 2>&1 | tee -a "$LOGFILE"; then
    echo "✅ Test 1 passed" | tee -a "$LOGFILE"
    TEST_PASS=$((TEST_PASS+1))
  else
    echo "❌ Test 1 failed" | tee -a "$LOGFILE"
    echo "Raw response (first 300 chars): ${RESULT:0:300}" | tee -a "$LOGFILE"
    TEST_FAIL=$((TEST_FAIL+1))
  fi
  echo "" | tee -a "$LOGFILE"

  # Test 2: property_search with bbox as STRING
  echo "Test 2: property_search with bbox STRING..." | tee -a "$LOGFILE"
  update_status "server_test" "running" "Test 2: bbox string"
  RESULT=$(curl -s --max-time 30 -X POST http://localhost:3001/api/chat \
    -H "Content-Type: application/json" \
    -d '{"messages":[{"role":"user","content":"Commercial properties downtown"}], "context":{"bbox":"-97.8,30.2,-97.7,30.35"}}' 2>&1) || RESULT="CURL_FAILED"

  if echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); c=len(d.get('properties',[])); print(f'Results: {c} properties'); exit(0 if c>0 else 1)" 2>&1 | tee -a "$LOGFILE"; then
    echo "✅ Test 2 passed" | tee -a "$LOGFILE"
    TEST_PASS=$((TEST_PASS+1))
  else
    echo "❌ Test 2 failed" | tee -a "$LOGFILE"
    echo "Raw response (first 300 chars): ${RESULT:0:300}" | tee -a "$LOGFILE"
    TEST_FAIL=$((TEST_FAIL+1))
  fi
  echo "" | tee -a "$LOGFILE"

  # Test 3: general_chat (Haiku routing)
  echo "Test 3: general_chat (Haiku routing)..." | tee -a "$LOGFILE"
  update_status "server_test" "running" "Test 3: general chat"
  RESULT=$(curl -s --max-time 20 -X POST http://localhost:3001/api/chat \
    -H "Content-Type: application/json" \
    -d '{"messages":[{"role":"user","content":"What can ScoutGPT do?"}]}' 2>&1) || RESULT="CURL_FAILED"

  if echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); t=d.get('text',''); print(f'Response: {t[:200]}'); exit(0 if len(t)>10 else 1)" 2>&1 | tee -a "$LOGFILE"; then
    echo "✅ Test 3 passed" | tee -a "$LOGFILE"
    TEST_PASS=$((TEST_PASS+1))
  else
    echo "❌ Test 3 failed" | tee -a "$LOGFILE"
    echo "Raw response (first 300 chars): ${RESULT:0:300}" | tee -a "$LOGFILE"
    TEST_FAIL=$((TEST_FAIL+1))
  fi
  echo "" | tee -a "$LOGFILE"

  # Summary
  echo "Tests: $TEST_PASS passed, $TEST_FAIL failed" | tee -a "$LOGFILE"
  if [ $TEST_FAIL -eq 0 ]; then
    STEP_SERVER="pass"
    update_status "server_test" "pass" "$TEST_PASS/$((TEST_PASS+TEST_FAIL)) tests passed"
  else
    STEP_SERVER="fail"
    update_status "server_test" "fail" "$TEST_FAIL tests failed"
  fi

  # Stop server
  echo "Stopping server..." | tee -a "$LOGFILE"
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  SERVER_PID=""
fi
echo "" | tee -a "$LOGFILE"

# ─── COMPLETE ─────────────────────────────────────────────────────
echo "=== COMPLETE ===" | tee -a "$LOGFILE"
echo "Finished: $(date)" | tee -a "$LOGFILE"
STEP_COMPLETE="done"
update_status "complete" "done" "All steps finished"

echo "" | tee -a "$LOGFILE"
echo "Review these files:" | tee -a "$LOGFILE"
echo "  1. Audit:    $AUDIT_DIR/neon-data-audit.md" | tee -a "$LOGFILE"
echo "  2. Log:      $LOGFILE" | tee -a "$LOGFILE"
echo "  3. Backup:   $BASEDIR/services/queryBuilder.js.bak" | tee -a "$LOGFILE"
echo "" | tee -a "$LOGFILE"
echo "Dashboard still running at http://0.0.0.0:$DASHBOARD_PORT" | tee -a "$LOGFILE"
echo "Press Ctrl+C to stop, or it will stay up for monitoring." | tee -a "$LOGFILE"

# Keep dashboard alive after completion so you can check it later
wait "$DASHBOARD_PID" 2>/dev/null || true
