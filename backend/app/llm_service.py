"""LLM service using Groq API to generate flashcard content.

Two distinct generation paths:
1. Front card: condense real LeetCode problem description + extract example
2. Back card: explain the submitted strategy, compare it with the textbook
   approach, and suggest a better solution only when one truly exists.
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


def _fallback_front_content(leetcode_content: str) -> dict[str, str]:
    """Produce a complete, non-truncated fallback when front generation fails."""
    text = re.sub(r"\s+", " ", leetcode_content or "").strip()
    sentences = re.split(r"(?<=[.!?])\s+", text)
    summary = " ".join(sentences[:4]).strip()
    return {"description": f"Goal\n{summary}" if summary else "", "example": ""}


def _normalize_front(parsed: Optional[dict], leetcode_content: str) -> dict[str, str]:
    if not parsed:
        return _fallback_front_content(leetcode_content)
    labels = (
        ("Goal", parsed.get("goal")),
        ("Given", parsed.get("given")),
        ("Return", parsed.get("return")),
        ("Key rule", parsed.get("key_rule")),
    )
    sections = [f"{label}\n{_clean_text(value)}" for label, value in labels if _clean_text(value)]
    description = "\n\n".join(sections) or _clean_text(parsed.get("description"))
    if not description:
        return _fallback_front_content(leetcode_content)
    return {"description": description, "example": _clean_text(parsed.get("example"))}


async def generate_front_content(
    problem_name: str, leetcode_content: str
) -> dict[str, str]:
    """Generate a predictable, one-read problem brief and example."""
    prompt = f"""You are writing the front of an interview-study flashcard.
Use direct, beginner-friendly language. Make the task understandable in one read.

Problem: {problem_name}

Official LeetCode description:
---
{leetcode_content[:6000]}
---

Return ONLY valid JSON with exactly these string keys:
- "goal": one short sentence saying what must be achieved
- "given": one short sentence describing the input
- "return": one short sentence describing the expected output
- "key_rule": only the constraint or edge case that changes how the solution works
- "example": one example formatted as two lines beginning "Input:" and "Output:"

Do not explain an algorithm. Do not repeat information across fields.
Return clean JSON only, no markdown."""

    for attempt in range(2):
        suffix = "" if attempt == 0 else (
            "\nYour previous response was invalid. Return every required key as plain text."
        )
        raw = await _call_groq(prompt + suffix, max_tokens=700)
        parsed = _parse_json(raw) if raw else None
        front = _normalize_front(parsed, leetcode_content)
        if parsed and len(front["description"]) >= 40:
            return front
    return _fallback_front_content(leetcode_content)


_BACK_FIELDS = (
    "pattern",
    "recognition_clues",
    "core_insight",
    "approach",
    "why_it_works",
    "complexity",
    "common_mistakes",
    "transfer_question",
    "user_approach",
    "optimization_verdict",
    "better_approach",
    "user_time_complexity",
    "user_space_complexity",
    "better_time_complexity",
    "better_space_complexity",
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
        "user_approach": "",
        "optimization_verdict": "",
        "better_approach": "",
        "user_time_complexity": "",
        "user_space_complexity": "",
        "better_time_complexity": "",
        "better_space_complexity": "",
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
    pattern = back.get("pattern") or ""
    clues = back.get("recognition_clues") or ""
    if pattern and clues:
        back["recognition_clues"] = re.sub(
            re.escape(pattern), "this technique", clues, flags=re.I
        ).strip()
    time_c, space_c = _split_complexity(back["complexity"])
    back["time_complexity"] = _clean_text(parsed.get("time_complexity")) or time_c
    back["space_complexity"] = _clean_text(parsed.get("space_complexity")) or space_c
    back["summary"] = _clean_text(parsed.get("solver_note") or parsed.get("summary"))
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


async def generate_placard(
    problem_name: str,
    code: str,
    github_file_path: str,
    leetcode_content: Optional[str] = None,
    leetcode_difficulty: Optional[str] = None,
) -> dict[str, Any]:
    """Orchestrate both LLM calls to produce a complete flashcard.

    Front card comes from the LeetCode statement. Back card explains and
    evaluates the submitted code before teaching the recommended approach.
    """
    settings = get_settings()
    missing_key_msg = "Set a valid Groq API key and resync to generate approach."

    if leetcode_content and settings.GROQ_API_KEY:
        front = await generate_front_content(problem_name, leetcode_content)
    elif leetcode_content:
        front = _fallback_front_content(leetcode_content)
    else:
        front = {"description": "", "example": ""}

    if settings.GROQ_API_KEY:
        await asyncio.sleep(1)
        back = await generate_back_content(problem_name, leetcode_content, code)
    else:
        back = _empty_back(missing_key_msg)
    usable_back = _back_is_usable(back)

    return {
        "problem_name": problem_name,
        "difficulty": leetcode_difficulty or "Medium",
        "description": front["description"],
        "example": front["example"],
        "pattern": back["pattern"],
        "recognition_clues": back.get("recognition_clues") or "",
        "core_insight": back.get("core_insight") or "",
        # Empty values become NULL at persistence time, preserving previously
        # generated content via COALESCE instead of overwriting it with errors.
        "approach": back["approach"] if usable_back else "",
        "why_it_works": back.get("why_it_works") or "",
        "complexity": back.get("complexity") or "",
        "common_mistakes": back.get("common_mistakes") or "",
        "transfer_question": back.get("transfer_question") or "",
        "user_approach": back.get("user_approach") or "",
        "optimization_verdict": back.get("optimization_verdict") or "",
        "better_approach": back.get("better_approach") or "",
        "user_time_complexity": back.get("user_time_complexity") or "",
        "user_space_complexity": back.get("user_space_complexity") or "",
        "better_time_complexity": back.get("better_time_complexity") or "",
        "better_space_complexity": back.get("better_space_complexity") or "",
        "time_complexity": back["time_complexity"],
        "space_complexity": back["space_complexity"],
        "summary": back.get("summary") or "",
        "code": code,
        "github_file_path": github_file_path,
    }
