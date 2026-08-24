"""LLM service using Groq API to generate flashcard content.

Two distinct generation paths:
1. Front card: condense real LeetCode problem description + extract example
2. Back card: teach the generalizable pattern for the problem. User code is
   supporting evidence of which pattern applies, not the thing being summarized.
"""

import asyncio
import json
import re
import logging
from typing import Any, Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"
MAX_RETRIES = 3
RETRY_BASE_DELAY = 3


def _extract_problem_name_from_path(path: str) -> str:
    """Derive problem name from path like 0026-remove-duplicates-from-sorted-array."""
    parts = path.replace("\\", "/").strip("/").split("/")
    for candidate in reversed(parts):
        base = candidate.rsplit(".", 1)[0] if "." in candidate else candidate
        match = re.match(r"^\d+-(.+)", base)
        if match:
            return match.group(1).replace("-", " ").title()
    base = parts[-1].rsplit(".", 1)[0] if "." in parts[-1] else parts[-1]
    return base.replace("-", " ").title()


async def _call_groq(prompt: str, max_tokens: int = 1024) -> Optional[str]:
    """Make a Groq API call with retry + exponential backoff on rate limits."""
    settings = get_settings()
    if not settings.GROQ_API_KEY:
        return None

    for attempt in range(MAX_RETRIES):
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                r = await client.post(
                    GROQ_CHAT_URL,
                    headers={
                        "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": settings.GROQ_MODEL,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.2,
                        "max_tokens": max_tokens,
                    },
                )
                if r.status_code == 429:
                    delay = RETRY_BASE_DELAY * (2 ** attempt)
                    logger.info("Groq rate limited, retrying in %ds (attempt %d/%d)", delay, attempt + 1, MAX_RETRIES)
                    await asyncio.sleep(delay)
                    continue

                if r.status_code != 200:
                    logger.warning("Groq API returned %s: %s", r.status_code, r.text[:200])
                    return None

                data = r.json()
                choices = data.get("choices")
                if not choices:
                    return None
                return (choices[0].get("message") or {}).get("content") or ""
        except Exception as e:
            logger.warning("Groq API call failed: %s", e)
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(RETRY_BASE_DELAY)
                continue
            return None
    return None


def _parse_json(text: str) -> Optional[dict]:
    """Extract JSON from LLM response (may be wrapped in markdown fences)."""
    text = text.strip()
    if "```" in text:
        start = text.find("```")
        rest = text[start + 3:]
        if rest.startswith("json"):
            rest = rest[4:].lstrip()
        end = rest.find("```")
        if end != -1:
            rest = rest[:end]
        text = rest
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


async def generate_front_content(
    problem_name: str, leetcode_content: str
) -> dict[str, str]:
    """Generate the front-of-card content by condensing the LeetCode problem.

    Sends the full LeetCode problem description to the LLM and asks it to produce:
    - A concise problem statement (keeping all constraints)
    - One Input/Output example
    """
    prompt = f"""You are a LeetCode flashcard creator.

Below is the full problem description from LeetCode:

---
{leetcode_content[:6000]}
---

Rewrite this into a flashcard format. Return ONLY valid JSON with these keys:

- "description": Rewrite the problem description so it is concise but does NOT remove any important facts, constraints, or requirements. Keep it to 3-5 sentences. Include what the input is, what the output should be, and key constraints.

- "example": Extract ONE clear example from the problem. Format it exactly like:
Input: nums = [2,7,11,15], target = 9
Output: [0,1]

Just the input/output, nothing else.

Return clean JSON only, no markdown."""

    raw = await _call_groq(prompt, max_tokens=800)
    if not raw:
        return {"description": leetcode_content[:500], "example": ""}

    parsed = _parse_json(raw)
    if not parsed:
        return {"description": leetcode_content[:500], "example": ""}

    return {
        "description": parsed.get("description") or leetcode_content[:500],
        "example": parsed.get("example") or "",
    }


_BACK_FIELDS = (
    "pattern",
    "recognition_clues",
    "core_insight",
    "approach",
    "why_it_works",
    "complexity",
    "common_mistakes",
    "transfer_question",
)

_BIG_O = re.compile(r"O\([^)]+\)")


def _empty_back(approach_msg: str) -> dict[str, str]:
    return {
        "pattern": "",
        "recognition_clues": "",
        "core_insight": "",
        "approach": approach_msg,
        "why_it_works": "",
        "complexity": "",
        "common_mistakes": "",
        "transfer_question": "",
        "time_complexity": "",
        "space_complexity": "",
        "summary": "",
    }


def _split_complexity(text: str) -> tuple[str, str]:
    """Pull short Big-O badges out of a free-form complexity explanation."""
    text = text or ""
    time_m = re.search(r"time[^O]{0,24}(O\([^)]+\))", text, re.I)
    space_m = re.search(r"space[^O]{0,24}(O\([^)]+\))", text, re.I)
    found = _BIG_O.findall(text)
    time_c = time_m.group(1) if time_m else (found[0] if found else "")
    space_c = space_m.group(1) if space_m else (found[1] if len(found) > 1 else "")
    return time_c, space_c


def _compose_approach(back: dict) -> str:
    """Flatten structured fields into one blob. Used only by tests / fallbacks."""
    chunks = []
    insight = (back.get("core_insight") or "").strip()
    steps = (back.get("approach") or "").strip()
    why = (back.get("why_it_works") or "").strip()
    clues = (back.get("recognition_clues") or "").strip()
    mistakes = (back.get("common_mistakes") or "").strip()
    transfer = (back.get("transfer_question") or "").strip()
    complexity = (back.get("complexity") or "").strip()
    if insight:
        chunks.append(insight)
    if steps:
        chunks.append(steps)
    if why:
        chunks.append(f"Why it works: {why}")
    if clues:
        chunks.append(f"Recognize this when: {clues}")
    if complexity:
        chunks.append(complexity)
    if mistakes:
        chunks.append(f"Common mistakes: {mistakes}")
    if transfer:
        chunks.append(f"Transfer: {transfer}")
    return "\n\n".join(chunks)


def _normalize_back(parsed: Optional[dict], fallback_msg: str) -> dict[str, str]:
    """Keep teaching fields separate. `approach` is only the generic steps."""
    if not parsed:
        return _empty_back(fallback_msg)
    back = {key: str(parsed.get(key) or "").strip() for key in _BACK_FIELDS}
    if not back["approach"]:
        back["approach"] = fallback_msg
    why = str(parsed.get("why_this_pattern") or back.get("core_insight") or "").strip()
    if why:
        back["core_insight"] = why
    pattern = back.get("pattern") or ""
    clues = back.get("recognition_clues") or ""
    if pattern and clues:
        back["recognition_clues"] = re.sub(
            re.escape(pattern), "this technique", clues, flags=re.I
        ).strip()
    time_c, space_c = _split_complexity(back["complexity"])
    back["time_complexity"] = str(parsed.get("time_complexity") or "").strip() or time_c
    back["space_complexity"] = str(parsed.get("space_complexity") or "").strip() or space_c
    back["summary"] = str(parsed.get("solver_note") or parsed.get("summary") or "").strip()
    return back


async def generate_back_content(
    problem_name: str,
    leetcode_content: Optional[str],
    code: str,
) -> dict[str, str]:
    """Generate pattern-first back-of-card fields for a LeetCode problem.

    The problem statement is the primary source. User code is only a hint for
    which standard pattern they used when several could apply.
    """
    statement = (leetcode_content or "").strip()
    if statement:
        statement_block = statement[:4000]
    else:
        statement_block = (
            "(No official statement available. Infer the well-known LeetCode "
            f"problem named '{problem_name}'. Use the code only as evidence of "
            "which pattern applies, not as something to narrate.)"
        )

    prompt = f"""You are writing an interview flashcard for a LeetCode problem.
Teach the GENERALIZABLE problem-solving approach. Do NOT summarize the user's code.

Problem name: {problem_name}

Official problem statement:
---
{statement_block}
---

User's submitted code (supporting evidence only — which pattern they chose.
Do NOT describe this code, its variables, control flow, or language):
```
{(code or "")[:4000]}
```

Return ONLY valid JSON with these keys:

- "pattern": Primary algorithm/data-structure pattern (e.g. "Two Pointers", "Sliding Window", "Hash Map", "Binary Search", "DFS", "BFS", "Dynamic Programming", "Greedy", "Heap", "Stack", "Backtracking", "Bit Manipulation"). One name, not a sentence.

- "why_this_pattern": Why THIS problem is that pattern. Talk about the problem shape (what the input looks like, what you must find or optimize), not about code. 2-3 sentences. Do not recap the full statement.

- "approach": Generic step-by-step algorithm, 3-5 short steps. No variable names, no language syntax, no "the user's solution".

Hard rules:
- Never mention identifiers, data-structure field names from the code, or "this implementation".
- Prefer the standard textbook approach for this problem. Use the code only if it clearly selects among valid patterns.
- Do not recap the problem statement.

Return clean JSON only, no markdown."""

    raw = await _call_groq(prompt, max_tokens=800)
    fallback = "Approach not available. Set a valid Groq API key and resync."
    if not raw:
        return _empty_back(fallback)
    return _normalize_back(_parse_json(raw), fallback)


async def generate_placard(
    problem_name: str,
    code: str,
    github_file_path: str,
    leetcode_content: Optional[str] = None,
    leetcode_difficulty: Optional[str] = None,
) -> dict[str, Any]:
    """Orchestrate both LLM calls to produce a complete flashcard.

    Front card comes from the LeetCode statement. Back card teaches the
    pattern; user code is only supporting evidence.
    """
    settings = get_settings()
    missing_key_msg = "Set a valid Groq API key and resync to generate approach."

    if leetcode_content and settings.GROQ_API_KEY:
        front = await generate_front_content(problem_name, leetcode_content)
    elif leetcode_content:
        front = {"description": leetcode_content[:500], "example": ""}
    else:
        front = {"description": "", "example": ""}

    if settings.GROQ_API_KEY:
        await asyncio.sleep(1)
        back = await generate_back_content(problem_name, leetcode_content, code)
    else:
        back = _empty_back(missing_key_msg)

    return {
        "problem_name": problem_name,
        "difficulty": leetcode_difficulty or "Medium",
        "description": front["description"],
        "example": front["example"],
        "pattern": back["pattern"],
        "recognition_clues": back.get("recognition_clues") or "",
        "core_insight": back.get("core_insight") or "",
        "approach": back["approach"],
        "why_it_works": back.get("why_it_works") or "",
        "complexity": back.get("complexity") or "",
        "common_mistakes": back.get("common_mistakes") or "",
        "transfer_question": back.get("transfer_question") or "",
        "time_complexity": back["time_complexity"],
        "space_complexity": back["space_complexity"],
        "summary": back.get("summary") or "",
        "code": code,
        "github_file_path": github_file_path,
    }
