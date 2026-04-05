#!/bin/bash
# ==============================================================================
# Pre-flight rate limit check
# Sends a minimal Claude request ($0.02) to verify API is accessible.
# Exit 0 = OK, Exit 1 = rate limited or auth failed
# ==============================================================================

RESULT=$(echo "respond with just: ok" | claude -p --output-format stream-json --verbose --max-budget-usd 0.02 2>&1 | grep '"type":"result"' | head -1)

if [ -z "$RESULT" ]; then
  echo "RATE_CHECK: no result received — possibly rate limited or auth failed"
  exit 1
fi

IS_ERROR=$(echo "$RESULT" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('is_error', False))" 2>/dev/null)
RESULT_TEXT=$(echo "$RESULT" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('result', ''))" 2>/dev/null)

if echo "$RESULT_TEXT" | grep -qi "hit your limit\|rate limit"; then
  echo "RATE_CHECK: RATE LIMITED — $RESULT_TEXT"
  exit 1
fi

if echo "$RESULT" | grep -q "authentication_failed"; then
  echo "RATE_CHECK: AUTH FAILED"
  exit 1
fi

echo "RATE_CHECK: OK"
exit 0
