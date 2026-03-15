"""Fetch problem descriptions from LeetCode's public GraphQL API."""

import re
import logging
from html import unescape
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

LEETCODE_GRAPHQL_URL = "https://leetcode.com/graphql"


def extract_slug_from_path(path: str) -> Optional[str]:
    """Extract LeetCode problem slug from a GitHub file path.

    '0026-remove-duplicates-from-sorted-array/solution.py' → 'remove-duplicates-from-sorted-array'
    '0001-two-sum.py' → 'two-sum'
    """
    parts = path.replace("\\", "/").strip("/").split("/")
    for candidate in reversed(parts):
        base = candidate.rsplit(".", 1)[0] if "." in candidate else candidate
        match = re.match(r"^\d+-(.+)", base)
        if match:
            return match.group(1).lower()
    return None


def _strip_html(html: str) -> str:
    """Convert LeetCode HTML content to readable plain text."""
    text = re.sub(r"<br\s*/?>", "\n", html)
    text = re.sub(r"</?p[^>]*>", "\n", text)
    text = re.sub(r"</?li[^>]*>", "\n• ", text)
    text = re.sub(r"</?[uo]l[^>]*>", "\n", text)
    text = re.sub(r"<strong>(.*?)</strong>", r"\1", text)
    text = re.sub(r"<em>(.*?)</em>", r"\1", text)
    text = re.sub(r"<code>(.*?)</code>", r"\1", text)
    text = re.sub(r"<pre>(.*?)</pre>", r"\1", text, flags=re.DOTALL)
    text = re.sub(r"<sup>(.*?)</sup>", r"^(\1)", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = unescape(text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    lines = [line.strip() for line in text.split("\n")]
    return "\n".join(lines).strip()


async def fetch_leetcode_problem(slug: str) -> Optional[dict]:
    """Fetch problem title, difficulty, and full description from LeetCode.

    Returns dict with 'title', 'difficulty', 'content' (plain text), or None on failure.
    """
    query = """
    query questionContent($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        title
        difficulty
        content
      }
    }
    """
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                LEETCODE_GRAPHQL_URL,
                json={"query": query, "variables": {"titleSlug": slug}},
                headers={
                    "Content-Type": "application/json",
                    "Referer": "https://leetcode.com",
                },
            )
            if r.status_code != 200:
                logger.warning("LeetCode API returned %s for slug '%s'", r.status_code, slug)
                return None

            data = r.json()
            question = (data.get("data") or {}).get("question")
            if not question or not question.get("content"):
                logger.warning("No content returned for slug '%s'", slug)
                return None

            return {
                "title": question.get("title") or "",
                "difficulty": question.get("difficulty") or "Medium",
                "content": _strip_html(question["content"]),
            }
    except Exception as e:
        logger.warning("Failed to fetch LeetCode problem '%s': %s", slug, e)
        return None
