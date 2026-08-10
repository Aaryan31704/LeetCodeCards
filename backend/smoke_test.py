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
from app.llm_service import _extract_problem_name_from_path, _parse_json  # noqa: E402
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
    check("health returns ok", r.status_code == 200 and r.json() == {"status": "ok"})
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
