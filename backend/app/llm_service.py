"""LLM service using Groq API to generate flashcard content.

Two distinct generation paths:
1. Front card: condense real LeetCode problem description + extract example
2. Back card: analyze user's code to determine the algorithmic approach
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


async def generate_back_content(code: str) -> dict[str, str]:
    """Generate the back-of-card content by analyzing the user's submitted code.

    Sends the code to the LLM and asks it to determine:
    - The algorithmic pattern
    - A 2-4 line explanation of the approach
    - Time/space complexity
    """
    prompt = f"""Analyze this code and determine the algorithmic approach used to solve the problem.
Explain it as if teaching a beginner who understands basic programming but is new to algorithms.

Code:
```
{code[:8000]}
```

Return ONLY valid JSON with these keys:

- "pattern": The primary algorithm/data-structure pattern used (e.g. "Two Pointers", "Hash Map", "Sliding Window", "Dynamic Programming", "Binary Search", "BFS/DFS", "Greedy", "Heap", "Stack", "Tree", "Graph", "Backtracking", "Bit Manipulation", "Math", "Sorting")

- "approach": Explain the solving strategy in 2-4 clear, beginner-friendly lines.
  Rules:
  - First line: name the technique/pattern used.
  - Next lines: explain HOW the solution works step by step using plain language.
  - Do NOT mention variable names, syntax, or code details.
  - Focus on the logic and reasoning behind the solution.
  - Last line: explain WHY this approach is efficient (compared to brute force if applicable).
  Example: "This solution uses the Two Pointer technique. Two indices move through the array from opposite ends, checking conditions and moving inward. When the target condition is met, the answer is found. This avoids nested loops and reduces time complexity from O(n^2) to O(n)."

- "time_complexity": Big-O time complexity (e.g. "O(n)", "O(n log n)")
- "space_complexity": Big-O space complexity (e.g. "O(1)", "O(n)")

Return clean JSON only, no markdown."""

    raw = await _call_groq(prompt, max_tokens=600)
    if not raw:
        return {
            "pattern": "",
            "approach": "Approach not available. Set a valid Groq API key and resync.",
            "time_complexity": "",
            "space_complexity": "",
        }

    parsed = _parse_json(raw)
    if not parsed:
        return {
            "pattern": "",
            "approach": "Approach not available. Set a valid Groq API key and resync.",
            "time_complexity": "",
            "space_complexity": "",
        }

    return {
        "pattern": parsed.get("pattern") or "",
        "approach": parsed.get("approach") or "",
        "time_complexity": parsed.get("time_complexity") or "",
        "space_complexity": parsed.get("space_complexity") or "",
    }


async def generate_placard(
    problem_name: str,
    code: str,
    github_file_path: str,
    leetcode_content: Optional[str] = None,
    leetcode_difficulty: Optional[str] = None,
) -> dict[str, Any]:
    """Orchestrate both LLM calls to produce a complete flashcard.

    If leetcode_content is available, uses it for the front card.
    Always analyzes the user's code for the back card.
    """
    settings = get_settings()

    if leetcode_content and settings.GROQ_API_KEY:
        front = await generate_front_content(problem_name, leetcode_content)
    elif leetcode_content:
        front = {"description": leetcode_content[:500], "example": ""}
    else:
        front = {
            "description": "",
            "example": "",
        }

    if settings.GROQ_API_KEY:
        await asyncio.sleep(1)
        back = await generate_back_content(code)
    else:
        back = {
            "pattern": "",
            "approach": "Set a valid Groq API key and resync to generate approach.",
            "time_complexity": "",
            "space_complexity": "",
        }

    return {
        "problem_name": problem_name,
        "difficulty": leetcode_difficulty or "Medium",
        "description": front["description"],
        "example": front["example"],
        "pattern": back["pattern"],
        "approach": back["approach"],
        "time_complexity": back["time_complexity"],
        "space_complexity": back["space_complexity"],
        "summary": "",
        "code": code,
        "github_file_path": github_file_path,
    }
