from __future__ import annotations

from urllib.parse import quote

import httpx
from bs4 import BeautifulSoup


async def web_search(query: str, max_results: int = 5) -> list[dict]:
    search_url = f"https://duckduckgo.com/html/?q={quote(query)}"
    headers = {"User-Agent": "MyAiChatAgent/1.0"}

    async with httpx.AsyncClient(timeout=20, headers=headers, follow_redirects=True) as client:
        response = await client.get(search_url)
        response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    results: list[dict] = []
    for item in soup.select(".result"):
        title_el = item.select_one(".result__title")
        snippet_el = item.select_one(".result__snippet")
        link_el = item.select_one(".result__url")
        title = title_el.get_text(" ", strip=True) if title_el else ""
        url = link_el.get_text(" ", strip=True) if link_el else ""
        snippet = snippet_el.get_text(" ", strip=True) if snippet_el else ""
        if not title or not url:
            continue
        results.append({"title": title, "url": url, "snippet": snippet})
        if len(results) >= max_results:
            break
    return results


async def fetch_url(url: str) -> dict:
    headers = {"User-Agent": "MyAiChatAgent/1.0"}
    async with httpx.AsyncClient(timeout=20, headers=headers, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else url
    paragraphs = [p.get_text(" ", strip=True) for p in soup.find_all("p")]
    content = "\n".join([item for item in paragraphs if item][:10]).strip()
    return {
        "url": url,
        "title": title,
        "content": content[:4000],
    }
