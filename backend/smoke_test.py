"""Dependency-free smoke test for the API. Run from backend/: python smoke_test.py

Covers auth enforcement, OAuth redirect validation, webhook signature and branch
handling, database-outage behaviour, and the parsing helpers. It does not need a
database: the checks assert the correct behaviour when the database is down.
"""

import hashlib
import hmac
import json
import os
import uuid

os.environ.setdefault("GITHUB_OAUTH_CLIENT_ID", "test_client_id")
os.environ.setdefault("GITHUB_OAUTH_CLIENT_SECRET", "test_secret")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.auth import create_token, verify_token  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.routes.auth import _build_redirect, _decode_state, _encode_state  # noqa: E402
from app.routes.webhooks import _verify_signature  # noqa: E402
from app.github_service import _is_leetcode_file  # noqa: E402
from app.llm_service import (
    _extract_problem_name_from_path,
    _parse_json,
    _number_steps,
    extract_example,
    _back_is_usable,
    _normalize_back,
    _normalize_learn,
    _learn_is_usable,
)  # noqa: E402
from app.leetcode_service import extract_slug_from_path  # noqa: E402

passed, failed = 0, 0


def check(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failed += 1
        print(f"  FAIL  {name} {detail}")


print("\n== Health & docs ==")
with TestClient(app, raise_server_exceptions=False) as client:
    r = client.get("/health")
    check(
        "health returns ok",
        r.status_code == 200
        and r.json().get("status") == "ok"
        and r.json().get("version") == get_settings().API_VERSION,
    )
    check("openapi schema builds", client.get("/openapi.json").status_code == 200)

    print("\n== Auth required ==")
    for path in ("/me", "/placards", "/me/resync/status"):
        check(f"{path} rejects anonymous", client.get(path).status_code == 401)
    check(
        "malformed bearer token rejected",
        client.get("/me", headers={"Authorization": "Bearer not-a-jwt"}).status_code == 401,
    )

    forged = create_token(uuid.uuid4(), 1).split(".")
    forged[1] = "eyJzdWIiOiAibm90LWEtdXVpZCJ9"
    check(
        "tampered token rejected (no 500)",
        client.get("/me", headers={"Authorization": f"Bearer {'.'.join(forged)}"}).status_code == 401,
    )

    print("\n== OAuth open-redirect protection ==")
    evil = client.get(
        "/auth/github", params={"app_redirect": "https://evil.example.com/steal"},
        follow_redirects=False,
    )
    check("https redirect target rejected", evil.status_code == 400, f"got {evil.status_code}")

    good = client.get(
        "/auth/github", params={"app_redirect": "leetplacards://auth/callback"},
        follow_redirects=False,
    )
    check("app scheme accepted", good.status_code == 307, f"got {good.status_code}")
    check(
        "redirects to github",
        good.headers.get("location", "").startswith("https://github.com/login/oauth/authorize"),
    )

    expo = client.get(
        "/auth/github", params={"app_redirect": "exp://192.168.1.5:8081/--/auth/callback"},
        follow_redirects=False,
    )
    check("expo scheme accepted", expo.status_code == 307, f"got {expo.status_code}")

    # The database may or may not be reachable; probe once and assert the
    # behaviour appropriate to each case rather than assuming one.
    probe = client.get("/me", headers={"Authorization": f"Bearer {create_token(uuid.uuid4(), 7)}"})
    DB_UP = probe.status_code != 503
    print(f"\n== Database is {'REACHABLE' if DB_UP else 'DOWN'}; asserting accordingly ==")

    if DB_UP:
        check(
            "unknown user gets 401 (not 500)",
            probe.status_code == 401, f"got {probe.status_code}",
        )
    else:
        check("db outage returns 503 not 500", probe.status_code == 503)
        check(
            "503 body has no traceback",
            "Traceback" not in probe.text and "asyncpg" not in probe.text,
        )

    def hook(payload, sign=True):
        """POST a webhook payload, signed with the configured secret when present."""
        body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        headers = {"Content-Type": "application/json"}
        secret = get_settings().GITHUB_WEBHOOK_SECRET
        if sign and secret:
            headers["X-Hub-Signature-256"] = (
                "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
            )
        return client.post("/webhooks/github", content=body, headers=headers)

    print("\n== Webhook ==")
    secret_set = bool(get_settings().GITHUB_WEBHOOK_SECRET)
    if secret_set:
        r = hook({"ref": "refs/heads/main", "repository": {"full_name": "a/b"}}, sign=False)
        check("unsigned payload rejected", r.status_code == 401, f"got {r.status_code}")
    else:
        print("  SKIP  unsigned-payload check (no GITHUB_WEBHOOK_SECRET configured)")

    check("rejects invalid JSON", hook(b"not json").status_code == 400)

    # Non-default-branch pushes short-circuit before any database access.
    r = hook({"ref": "refs/heads/feature-x", "repository": {"full_name": "a/b", "default_branch": "main"}})
    check("non-default branch ignored", r.status_code == 200, f"got {r.status_code}")

    # A repo whose default branch is 'develop' must still reach the user lookup.
    r = hook({"ref": "refs/heads/develop", "repository": {"full_name": "a/b", "default_branch": "develop"}})
    expected = 200 if DB_UP else 503
    check(
        f"non-main default branch reaches lookup (expect {expected})",
        r.status_code == expected, f"got {r.status_code}",
    )

    r = hook({"ref": "refs/heads/main", "repository": {"full_name": "a/b", "default_branch": "main"}})
    if DB_UP:
        check("unknown repo acknowledged with 200", r.status_code == 200, f"got {r.status_code}")
    else:
        check("webhook signals retry on db outage", r.status_code == 503, f"got {r.status_code}")

    print("\n== Error detail not leaked ==")
    check("DEBUG defaults off", get_settings().DEBUG is False)

print("\n== Redirect allowlist (unit) ==")
check("evil state decoded to None", _decode_state(_encode_state("https://evil.com")) is None)
check("valid state round-trips", _decode_state(_encode_state("leetplacards://auth")) == "leetplacards://auth")
check("garbage state is None", _decode_state("!!!not-base64!!!") is None)
check(
    "fallback redirect used when state rejected",
    _build_redirect(None, token="abc").startswith("leetplacards://auth/callback?token="),
)

print("\n== Webhook signature ==")
secret = b"topsecret"
payload = b'{"ref":"refs/heads/main"}'
sig = "sha256=" + hmac.new(secret, payload, hashlib.sha256).hexdigest()
s = get_settings()
original = s.GITHUB_WEBHOOK_SECRET
try:
    s.GITHUB_WEBHOOK_SECRET = "topsecret"
    check("valid signature accepted", _verify_signature(payload, sig) is True)
    check("bad signature rejected", _verify_signature(payload, "sha256=deadbeef") is False)
    check("missing signature rejected", _verify_signature(payload, None) is False)
finally:
    s.GITHUB_WEBHOOK_SECRET = original

print("\n== JWT ==")
uid = uuid.uuid4()
tok = create_token(uid, 42)
decoded = verify_token(tok)
check("token round-trips", decoded and decoded["sub"] == str(uid) and decoded["github_id"] == 42)
check("garbage token rejected", verify_token("garbage") is None)

print("\n== Path parsing ==")
check("leetcode file matched", _is_leetcode_file("LeetCode/0001-two-sum.py", "LeetCode"))
check("readme not matched", not _is_leetcode_file("LeetCode/README.md", "LeetCode"))
check("wrong prefix not matched", not _is_leetcode_file("other/0001-two-sum.py", "LeetCode"))
check("empty prefix matches any solution", _is_leetcode_file("anywhere/0001-two-sum.py", ""))
check(
    "LeetHub root cpp is skipped with LeetCode prefix",
    not _is_leetcode_file("0001-two-sum/0001-two-sum.cpp", "LeetCode"),
)
check(
    "LeetHub root cpp matches with empty prefix",
    _is_leetcode_file("0001-two-sum/0001-two-sum.cpp", ""),
)
check("prefix-only path rejected", not _is_leetcode_file("LeetCode", "LeetCode"))
check(
    "slug extracted from dir",
    extract_slug_from_path("0026-remove-duplicates-from-sorted-array/solution.py")
    == "remove-duplicates-from-sorted-array",
)
check("slug extracted from file", extract_slug_from_path("LeetCode/0001-two-sum.py") == "two-sum")
check("no slug for plain name", extract_slug_from_path("utils/helpers.py") is None)
check(
    "problem name derived",
    _extract_problem_name_from_path("LeetCode/0001-two-sum.py") == "Two Sum",
)

print("\n== LLM JSON parsing ==")
check("plain json", _parse_json('{"a": 1}') == {"a": 1})
check("fenced json", _parse_json('```json\n{"a": 1}\n```') == {"a": 1})
check("bare fence", _parse_json('```\n{"a": 1}\n```') == {"a": 1})
check("invalid json returns None", _parse_json("not json at all") is None)
print("\n== Example extraction from the official statement ==")
_STATEMENT = """Given an array of integers nums and an integer target, return indices.

Example 1:

Input: nums = [2,7,11,15], target = 9
Output: [0,1]
Explanation: Because nums[0] + nums[1] == 9, we return [0, 1].

Example 2:

Input: nums = [3,2,4], target = 6
Output: [1,2]

Constraints:

2 <= nums.length <= 10000
"""
_example = extract_example(_STATEMENT)
check("example keeps the exact input line", "Input: nums = [2,7,11,15], target = 9" in _example)
check("example keeps the output line", "Output: [0,1]" in _example)
check("example stops before the second one", "[3,2,4]" not in _example)
check("example stops before the constraints", "10000" not in _example)
check("example ignores prose between the markers", _example.count("\n") == 2)
check("statement without an example yields nothing", extract_example("Just prose.") == "")
check("missing statement is handled", extract_example(None) == "")

print("\n== Pattern-first back-card helpers ==")
check(
    "approach arrays become numbered lines",
    _number_steps(["Scan each value", "Check its complement", "Return the pair"])
    == "1. Scan each value\n2. Check its complement\n3. Return the pair",
)
check(
    "legacy stringified arrays are repaired",
    _number_steps("['Scan each value', 'Return the answer']")
    == "1. Scan each value\n2. Return the answer",
)
normalized = _normalize_back(
    {
        "pattern": "Two Pointers",
        "core_insight": "Sorted input lets two pointers meet in linear time.",
        "approach": "Start at both ends and move the pointer that cannot contribute.",
    },
    "fallback",
)
check("normalize keeps steps only", normalized["approach"].startswith("Start at both ends"))
check("normalize drops retired teaching fields", "transfer_question" not in normalized)
check("normalize maps why_this_pattern to core_insight", _normalize_back(
    {
        "pattern": "Two Pointers",
        "why_this_pattern": "Sorted input plus a pair target makes opposite-end elimination possible.",
        "approach": ["Start at both ends.", "Compare the pair.", "Move the impossible side."],
    },
    "fallback",
)["core_insight"] == "Sorted input plus a pair target makes opposite-end elimination possible.")
check(
    "complete teaching back is usable",
    _back_is_usable(
        _normalize_back(
            {
                "pattern": "Hash Map",
                "why_this_pattern": "Fast complement lookups turn pair search into one scan.",
                "user_approach": [
                    "Scan each number once.",
                    "Look up the complement in a hash map.",
                    "Return both indices when the match appears.",
                ],
                "optimization_verdict": "Already optimal — linear time is best for an unsorted array.",
                "approach": [
                    "Create an empty lookup.",
                    "Check the needed complement for each value.",
                    "Store each value after checking it.",
                ],
            },
            "fallback",
        )
    ),
)
comparison = _normalize_back(
    {
        "pattern": "Hash Map",
        "why_this_pattern": "A lookup avoids checking every possible pair.",
        "user_approach": ["Sort the values", "Search for a pair"],
        "optimization_verdict": "Good, but improvable — sorting costs extra time.",
        "approach": ["Build a lookup", "Check each complement", "Return the pair"],
        "better_approach": ["Scan once", "Check a hash map", "Store the current value"],
        "user_time_complexity": "O(n log n)",
        "better_time_complexity": "O(n)",
    },
    "fallback",
)
check("user approach is numbered", comparison["user_approach"].startswith("1. Sort"))
check("better approach is numbered", comparison["better_approach"].startswith("1. Scan"))
check("optimization verdict remains separate", comparison["optimization_verdict"].startswith("Good"))
check("empty parse uses fallback", _normalize_back(None, "nope")["approach"] == "nope")

print("\n== Placard content contract ==")
from app.placard_service import CONTENT_FIELDS  # noqa: E402
from app.schemas import PlacardResponse  # noqa: E402

# Pydantic silently drops undeclared keys, so a column that never reaches the
# schema is fetched and then thrown away without any error to notice.
_undeclared = [f for f in CONTENT_FIELDS if f not in PlacardResponse.model_fields]
check("every stored content field is returned by the API", not _undeclared, str(_undeclared))
check("statement is part of the API contract", "statement" in PlacardResponse.model_fields)

print("\n== Guided lesson helpers ==")
lesson = _normalize_learn({
    "plain_explanation": (
        "Find two positions whose values combine to make the target. "
        "Each position may be used only once, and the positions are the answer."
    ),
    "dry_run": [
        "Start with values [2, 7] and target 9.",
        "At 2, the missing value is 7, so remember 2.",
        "At 7, the missing value 2 has already been seen, so return both positions.",
    ],
    "naive_approach": (
        "Try every pair and check its sum. This costs O(n²) time because "
        "the same candidates are compared repeatedly."
    ),
    "invariant": "Every remembered value came from an earlier position and has not been reused.",
    "pseudocode": [
        "Create an empty value-to-position lookup.",
        "For each value, check whether its complement is in the lookup.",
        "Return both positions when found; otherwise remember the current value.",
    ],
})
check("guided dry run is numbered", lesson["dry_run"].startswith("1. Start"))
check("guided pseudocode is numbered", lesson["pseudocode"].startswith("1. Create"))
check("complete guided lesson is usable", _learn_is_usable(lesson))
check("short guided lesson is rejected", not _learn_is_usable(_normalize_learn({
    "plain_explanation": "Too short",
    "dry_run": ["One step"],
    "naive_approach": "Guess.",
    "invariant": "None.",
    "pseudocode": ["Return."],
})))

print("\n== Database recovery ==")
import asyncio  # noqa: E402

from app import main as app_main  # noqa: E402


async def _probe_schema_retry() -> int:
    """A paused database must be migrated once it answers again."""
    attempts = {"count": 0}

    async def flaky_schema() -> bool:
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise RuntimeError("database paused")
        return attempts["count"] > 2

    original = (
        app_main.apply_schema,
        app_main.SCHEMA_RETRY_START_SECONDS,
        app_main.SCHEMA_RETRY_MAX_SECONDS,
    )
    app_main.apply_schema = flaky_schema
    app_main.SCHEMA_RETRY_START_SECONDS = 0
    app_main.SCHEMA_RETRY_MAX_SECONDS = 0
    try:
        await asyncio.wait_for(app_main._retry_schema_until_ready(), timeout=5)
    finally:
        (
            app_main.apply_schema,
            app_main.SCHEMA_RETRY_START_SECONDS,
            app_main.SCHEMA_RETRY_MAX_SECONDS,
        ) = original
    return attempts["count"]


retry_attempts = asyncio.run(_probe_schema_retry())
check(
    "schema retry survives errors and a dead pool, then migrates",
    retry_attempts == 3,
    f"attempts={retry_attempts}",
)

print("\n== Stale resync detection ==")
import time  # noqa: E402

from app.placard_service import STALE_PROGRESS_SECONDS, is_resync_running  # noqa: E402

now = time.time()
check("fresh running is running", is_resync_running({"status": "running", "updated_at": now}))
check(
    "stale running is not running",
    not is_resync_running({"status": "running", "updated_at": now - STALE_PROGRESS_SECONDS - 1}),
)
check("done is not running", not is_resync_running({"status": "done", "updated_at": now}))
check("missing timestamp is not running", not is_resync_running({"status": "running"}))
check("none is not running", not is_resync_running(None))

print("\n== Config ==")
DECOMMISSIONED = ("llama-3.1-70b-versatile", "llama-3.1-8b-instant", "llama-3.3-70b-versatile")
check(
    "groq model is not decommissioned",
    get_settings().GROQ_MODEL not in DECOMMISSIONED,
    get_settings().GROQ_MODEL,
)
check("config_warnings returns list", isinstance(get_settings().config_warnings(), list))
check("worker.py removed", not os.path.exists(os.path.join("app", "worker.py")))

print(f"\n{'=' * 40}\n  {passed} passed, {failed} failed\n{'=' * 40}")
raise SystemExit(1 if failed else 0)
