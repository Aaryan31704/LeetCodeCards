"""LLM service using Groq API to generate flashcard content.

Three distinct generation paths:
1. Front card: condense real LeetCode problem description + extract example
2. Back card: explain the submitted strategy, compare it with the textbook
   approach, and suggest a better solution only when one truly exists.
3. Learn lesson: build intuition with a concrete trace and pseudocode.
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


def _clean_text(value: Any) -> str:
    """Normalize model values without leaking Python list syntax into cards."""
    if isinstance(value, list):
        return " ".join(
            str(item).strip().rstrip(".") + "."
            for item in value
            if str(item).strip()
        ).strip()
    return str(value or "").strip()


def _number_steps(value: Any) -> str:
    """Store an approach as numbered lines, accepting JSON arrays or text."""
    if isinstance(value, list):
        steps = [str(item).strip().lstrip("-• ").strip() for item in value if str(item).strip()]
    else:
        text = str(value or "").strip()
        if not text:
            return ""
        if text.startswith("[") and text.endswith("]"):
            try:
                parsed = json.loads(text.replace("'", '"'))
                steps = [str(item).strip() for item in parsed if str(item).strip()]
            except (json.JSONDecodeError, TypeError):
                steps = [text]
        else:
            lines = [line.strip() for line in text.splitlines() if line.strip()]
            steps = [
                re.sub(r"^(?:step\s*)?\d+[\).:\-]\s*", "", line, flags=re.I)
                .lstrip("-• ")
                .strip()
                for line in lines
            ]
            if len(steps) == 1:
                return steps[0]
    return "\n".join(f"{index}. {step}" for index, step in enumerate(steps, 1))


_EXAMPLE_BLOCK = re.compile(
    r"Example\s*1?\s*:?\s*\n(.+?)(?=\n\s*Example\s*\d|\n\s*Constraints|\Z)",
    re.S | re.I,
)
_EXAMPLE_LINE = re.compile(r"^(Input|Output|Explanation)\b", re.I)


def extract_example(statement: str) -> str:
    """Take the first worked example verbatim from the official statement.

    Reading it out of the real text keeps the exact values and formatting,
    which a paraphrase tended to round off or invent.
    """
    match = _EXAMPLE_BLOCK.search(statement or "")
    if not match:
        return ""
    lines = [line.strip() for line in match.group(1).splitlines() if line.strip()]
    kept = [line for line in lines if _EXAMPLE_LINE.match(line)]
    return "\n".join(kept[:3])


_BACK_FIELDS = (
    "pattern",
    "core_insight",
    "approach",
    "user_approach",
    "optimization_verdict",
    "better_approach",
    "user_time_complexity",
    "user_space_complexity",
    "better_time_complexity",
    "better_space_complexity",
)

def _empty_back(approach_msg: str) -> dict[str, str]:
    back = {field: "" for field in _BACK_FIELDS}
    back["approach"] = approach_msg
    return back


def _normalize_back(parsed: Optional[dict], fallback_msg: str) -> dict[str, str]:
    """Keep teaching fields separate. `approach` is only the generic steps."""
    if not parsed:
        return _empty_back(fallback_msg)
    back = {key: _clean_text(parsed.get(key)) for key in _BACK_FIELDS}
    back["approach"] = _number_steps(parsed.get("approach"))
    back["user_approach"] = _number_steps(parsed.get("user_approach"))
    back["better_approach"] = _number_steps(parsed.get("better_approach"))
    if back["optimization_verdict"].startswith("Already optimal"):
        back["better_approach"] = ""
        back["better_time_complexity"] = ""
        back["better_space_complexity"] = ""
    if not back["approach"]:
        back["approach"] = fallback_msg
    why = _clean_text(parsed.get("why_this_pattern") or back.get("core_insight"))
    if why:
        back["core_insight"] = why
    return back


def _back_is_usable(back: dict[str, str]) -> bool:
    approach = (back.get("approach") or "").strip()
    user_approach = (back.get("user_approach") or "").strip()
    verdict = (back.get("optimization_verdict") or "").strip()
    valid_verdict = verdict.startswith(
        ("Already optimal", "Good, but improvable", "Suboptimal")
    )
    has_needed_improvement = verdict.startswith("Already optimal") or len(
        (back.get("better_approach") or "").strip()
    ) >= 30
    return bool(
        len((back.get("pattern") or "").strip()) >= 3
        and len((back.get("core_insight") or "").strip()) >= 20
        and len(approach) >= 30
        and len(user_approach) >= 30
        and valid_verdict
        and has_needed_improvement
        and not approach.startswith(("Approach not available", "Set a valid"))
    )


async def generate_back_content(
    problem_name: str,
    leetcode_content: Optional[str],
    code: str,
) -> dict[str, str]:
    """Explain the submitted solution and compare it with the optimal approach."""
    statement = (leetcode_content or "").strip()
    if statement:
        statement_block = statement[:4000]
    else:
        statement_block = (
            "(No official statement available. Infer the well-known LeetCode "
            f"problem named '{problem_name}', then analyze the submitted code.)"
        )

    prompt = f"""You are writing an interview flashcard for a LeetCode problem.
Explain the submitted strategy and compare it with the best interview approach.

Problem name: {problem_name}

Official problem statement:
---
{statement_block}
---

User's submitted code:
```
{(code or "")[:4000]}
```

Return ONLY valid JSON with these keys:

- "pattern": Primary algorithm/data-structure pattern (e.g. "Two Pointers", "Sliding Window", "Hash Map", "Binary Search", "DFS", "BFS", "Dynamic Programming", "Greedy", "Heap", "Stack", "Backtracking", "Bit Manipulation"). One name, not a sentence.

- "why_this_pattern": Why THIS problem is that pattern. Talk about the problem shape (what the input looks like, what you must find or optimize), not about code. 2-3 sentences. Do not recap the full statement.

- "user_approach": A JSON array of 2-5 short steps explaining what the submitted code actually does. Describe its logic and chosen data structures in plain language. Do not copy code or identifier names.
- "user_time_complexity": Big-O time complexity of the submitted code.
- "user_space_complexity": Big-O auxiliary space complexity of the submitted code.
- "optimization_verdict": Exactly one of "Already optimal", "Good, but improvable", or "Suboptimal", followed by one short sentence explaining why.
- "approach": A JSON array of 3-5 short steps for the recommended interview approach. If the submitted approach is already optimal, this should clarify the clean textbook version of the same strategy.
- "better_approach": A JSON array describing a strictly better approach only when one exists; otherwise return an empty array.
- "better_time_complexity": Big-O time for the better approach, or an empty string when already optimal.
- "better_space_complexity": Big-O auxiliary space for the better approach, or an empty string when already optimal.

Hard rules:
- Explain the submitted strategy, not each source line. Never copy identifier names.
- Judge optimality against the standard interview solution for this exact problem.
- Never invent a "better" approach when asymptotic complexity and clarity are already optimal.
- Do not recap the problem statement.

Return clean JSON only, no markdown."""

    fallback = "Approach not available. Set a valid Groq API key and resync."
    for attempt in range(2):
        suffix = "" if attempt == 0 else (
            "\nYour previous response was incomplete. Return every required key; "
            "include the submitted-code analysis, verdict, and recommended approach."
        )
        raw = await _call_groq(prompt + suffix, max_tokens=1400)
        back = _normalize_back(_parse_json(raw) if raw else None, fallback)
        if _back_is_usable(back):
            return back
    return _empty_back(fallback)


_LEARN_FIELDS = (
    "plain_explanation",
    "dry_run",
    "naive_approach",
    "invariant",
    "pseudocode",
)


def _empty_learn() -> dict[str, str]:
    return {key: "" for key in _LEARN_FIELDS}


def _normalize_learn(parsed: Optional[dict]) -> dict[str, str]:
    """Normalize guided-lesson fields into predictable display text."""
    if not parsed:
        return _empty_learn()
    learn = {key: _clean_text(parsed.get(key)) for key in _LEARN_FIELDS}
    learn["dry_run"] = _number_steps(parsed.get("dry_run"))
    learn["pseudocode"] = _number_steps(parsed.get("pseudocode"))
    return learn


def _learn_is_usable(learn: dict[str, str]) -> bool:
    """Require the two fields a lesson cannot teach without.

    The extras are optional on purpose: gating on all five made one weak
    sentence discard an otherwise good lesson.
    """
    explanation = (learn.get("plain_explanation") or "").strip()
    trace = (learn.get("dry_run") or "").strip()
    return bool(
        len(explanation) >= 20
        and len(trace) >= 40
        and trace.count("\n") >= 2
        and not any("```" in (value or "") for value in learn.values())
    )


async def generate_learn_content(
    problem_name: str,
    leetcode_content: Optional[str],
    code: str,
) -> dict[str, str]:
    """Generate a first-time lesson that bridges the statement and algorithm."""
    statement = (leetcode_content or "").strip() or (
        f"No official statement is available. Infer the well-known LeetCode problem "
        f"named '{problem_name}' and avoid inventing constraints."
    )
    prompt = f"""You are a patient algorithms tutor creating a guided lesson.
Your reader has seen the problem but does not yet understand how to solve it.
Build the missing bridge from the concrete example to the algorithm.

Problem: {problem_name}

Official statement:
---
{statement[:5000]}
---

Submitted solution:
```
{(code or "")[:4000]}
```

Return ONLY valid JSON with exactly these keys:
- "plain_explanation": ONE short sentence restating the task in everyday language. The learner can already read the official statement, so do not repeat its details, constraints, or examples. Do not explain the solution.
- "dry_run": a JSON array of 3-7 short steps tracing the smallest useful concrete example from input to output. Show changing values or choices at each step.
- "naive_approach": 2-3 sentences describing the most natural brute-force idea, its Big-O cost, and precisely why it does unnecessary work.
- "invariant": one plain sentence describing what remains true after every iteration or recursive call in the recommended algorithm.
- "pseudocode": a JSON array of 3-8 language-independent operations for the recommended algorithm. No programming-language syntax and no identifiers copied from the submitted code.

Hard rules:
- Use the actual problem and submitted solution; do not give generic algorithm advice.
- Prefer one tiny concrete example over abstract wording.
- Make every dry-run step causally explain the next decision.
- Do not use markdown or code fences inside values.
- Do not repeat the same explanation across fields.

Return clean JSON only, no markdown."""

    for attempt in range(2):
        suffix = "" if attempt == 0 else (
            "\nThe previous lesson was incomplete. Return every key with a concrete "
            "worked trace and language-independent pseudocode."
        )
        raw = await _call_groq(prompt + suffix, max_tokens=1500)
        learn = _normalize_learn(_parse_json(raw) if raw else None)
        if _learn_is_usable(learn):
            return learn
    return _empty_learn()


async def generate_placard(
    problem_name: str,
    code: str,
    github_file_path: str,
    leetcode_content: Optional[str] = None,
    leetcode_difficulty: Optional[str] = None,
) -> dict[str, Any]:
    """Orchestrate both LLM calls to produce a complete flashcard.

    The problem itself is never generated: the official statement is stored as
    written and its first example is lifted out of it. The model is only asked
    to teach the problem and to evaluate the submitted code.
    """
    settings = get_settings()
    missing_key_msg = "Set a valid Groq API key and resync to generate approach."
    statement = (leetcode_content or "").strip()

    if settings.GROQ_API_KEY:
        await asyncio.sleep(1)
        back = await generate_back_content(problem_name, leetcode_content, code)
        await asyncio.sleep(1)
        learn = await generate_learn_content(problem_name, leetcode_content, code)
    else:
        back = _empty_back(missing_key_msg)
        learn = _empty_learn()
    usable_back = _back_is_usable(back)
    usable_learn = _learn_is_usable(learn)

    return {
        "problem_name": problem_name,
        "difficulty": leetcode_difficulty or "Medium",
        # The official wording is the specification. Keep it verbatim so the
        # exact constraints survive instead of being paraphrased away.
        "statement": statement,
        "example": extract_example(statement),
        "pattern": back["pattern"],
        "core_insight": back.get("core_insight") or "",
        # Empty values become NULL at persistence time, preserving previously
        # generated content via COALESCE instead of overwriting it with errors.
        "approach": back["approach"] if usable_back else "",
        "user_approach": back.get("user_approach") or "",
        "optimization_verdict": back.get("optimization_verdict") or "",
        "better_approach": back.get("better_approach") or "",
        "user_time_complexity": back.get("user_time_complexity") or "",
        "user_space_complexity": back.get("user_space_complexity") or "",
        "better_time_complexity": back.get("better_time_complexity") or "",
        "better_space_complexity": back.get("better_space_complexity") or "",
        "plain_explanation": learn["plain_explanation"] if usable_learn else "",
        "dry_run": learn["dry_run"] if usable_learn else "",
        "naive_approach": learn["naive_approach"] if usable_learn else "",
        "invariant": learn["invariant"] if usable_learn else "",
        "pseudocode": learn["pseudocode"] if usable_learn else "",
        "code": code,
        "github_file_path": github_file_path,
    }
