#!/usr/bin/env python3
"""Pre-flight PR body validation. Run before gh pr create."""
import json, re, sys
REQUIRED = ["## Task","## Changes Summary","## Acceptance Criteria Verification","## Test Results",
            "## Scene/Node Changes","## Signal Changes","## Data Changes","## Decisions Made","## Constraints Discovered"]
def validate(body):
    errors = []
    for s in REQUIRED:
        if s not in body: errors.append(f"Missing: {s}")
    m = re.search(r"```json\s*([\s\S]*?)```", body)
    if not m: errors.append("No ```json block"); return errors
    try:
        d = json.loads(m.group(1))
        acv = d.get("acceptanceCriteriaVerification")
        if not isinstance(acv, list) or not acv: errors.append("Empty/missing acv array")
        else:
            for i,e in enumerate(acv):
                for k in ["criterion","verified","evidence"]:
                    if k not in e: errors.append(f"acv[{i}] missing '{k}'")
    except json.JSONDecodeError as e: errors.append(f"Invalid JSON: {e}")
    return errors
if len(sys.argv)<2: print("Usage: validate_pr_body.py <file>",file=sys.stderr); sys.exit(1)
try: body=open(sys.argv[1]).read()
except: print(f"File not found: {sys.argv[1]}",file=sys.stderr); sys.exit(1)
errs=validate(body)
if errs: print(f"FAILED ({len(errs)} errors):"); [print(f"  ✗ {e}") for e in errs]; sys.exit(1)
else: print("VALIDATION PASSED ✓")
