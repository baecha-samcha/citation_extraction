(function (root) {
  "use strict";

  const BAD_TITLE = /^(home|login|log in|sign in|menu|search|search results?|untitled|homepage)$/i;
  const ORG_WORDS = /\b(university|institute|institution|ministry|department|agency|association|organization|organisation|foundation|company|corporation|council|committee|government|office|bureau|news|press|team|staff|editorial)\b/i;

  function normalizeWhitespace(value) {
    return String(value || "").replace(/[\u00a0\u2000-\u200b\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function getTextSafely(node) {
    if (!node) return "";
    return normalizeWhitespace(node.getAttribute?.("content") || node.textContent || "");
  }

  function meta(selector) {
    return normalizeWhitespace(document.querySelector(selector)?.getAttribute("content") || "");
  }

  function parseJsonLd() {
    const result = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      try {
        const parsed = JSON.parse(script.textContent.replace(/^\s*<!--|-->\s*$/g, ""));
        const visit = (item) => {
          if (!item || typeof item !== "object") return;
          if (Array.isArray(item)) return item.forEach(visit);
          if (Array.isArray(item["@graph"])) item["@graph"].forEach(visit);
          if (item["@type"] || item.headline || item.name || item.author || item.datePublished) result.push(item);
        };
        visit(parsed);
      } catch (_) {
        // Invalid JSON-LD blocks are common and are ignored independently.
      }
    });
    return result;
  }

  function domainFallback() {
    const host = location.hostname.replace(/^www\./i, "");
    const main = host.split(".").slice(0, -1).join(".") || host;
    return main.split(/[.-]/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  }

  function cleanTitle(value, websiteName) {
    let title = normalizeWhitespace(value)
      .replace(/^[\s\-–—|:;·•]+|[\s\-–—|:;·•]+$/g, "")
      .replace(/\s*[\u200e\u200f]\s*/g, "");
    const site = normalizeWhitespace(websiteName);
    const separators = [" | ", " - ", " – ", " — ", " :: ", " · "];
    for (const separator of separators) {
      const pieces = title.split(separator).map(normalizeWhitespace).filter(Boolean);
      if (pieces.length < 2) continue;
      const last = pieces[pieces.length - 1];
      if ((site && last.toLowerCase() === site.toLowerCase()) || last.length < Math.max(35, title.length * 0.45)) {
        title = pieces.slice(0, -1).join(separator);
        break;
      }
    }
    return normalizeWhitespace(title).replace(/[\s|:;\-–—]+$/g, "");
  }

  function scoreTitleCandidate(candidate) {
    const text = normalizeWhitespace(candidate.value);
    let score = Number(candidate.baseScore || 0);
    if (text.length < 5) score -= 80;
    else if (text.length <= 160) score += 12;
    if (text.length > 220) score -= 45;
    if (BAD_TITLE.test(text) || /\b(cookie|privacy policy|terms of use|navigation)\b/i.test(text)) score -= 90;
    if (candidate.element?.closest("article, main")) score += 18;
    if (candidate.element && candidate.element.getBoundingClientRect) {
      const rect = candidate.element.getBoundingClientRect();
      if (rect.width > 250 && rect.top < Math.max(innerHeight * 1.5, 1200)) score += 8;
    }
    return score;
  }

  function addCandidate(list, value, source, baseScore, element) {
    const clean = normalizeWhitespace(value);
    if (!clean) return;
    if (list.some((item) => item.value.toLowerCase() === clean.toLowerCase())) return;
    list.push({ value: clean, source, baseScore, element });
  }

  function extractWebsiteName(jsonLd) {
    for (const item of jsonLd) {
      const publisher = item.publisher;
      const name = typeof publisher === "string" ? publisher : publisher?.name;
      if (name) return { value: normalizeWhitespace(name), source: "JSON-LD publisher.name" };
    }
    const choices = [
      [meta('meta[property="og:site_name"]'), 'meta[property="og:site_name"]'],
      [meta('meta[name="application-name"]'), 'meta[name="application-name"]']
    ];
    for (const [value, source] of choices) if (value) return { value, source };
    const docTitle = normalizeWhitespace(document.title);
    const match = docTitle.match(/\s(?:\||-|–|—|::|·)\s([^|–—]{2,60})$/);
    if (match) return { value: normalizeWhitespace(match[1]), source: "document.title separator suffix" };
    return { value: domainFallback(), source: "domain fallback" };
  }

  function extractPublisher(jsonLd, websiteName) {
    for (const item of jsonLd) {
      const publisher = item.publisher;
      const name = typeof publisher === "string" ? publisher : publisher?.name;
      if (name) return { value: normalizeWhitespace(name), source: "JSON-LD publisher.name" };
    }
    const value = meta('meta[name="publisher"]') || meta('meta[name="DC.publisher"]') || meta('meta[name="dcterms.publisher"]');
    return { value: value || websiteName, source: value ? "publisher metadata" : "website name fallback" };
  }

  function extractTitle(jsonLd, websiteName) {
    const candidates = [];
    jsonLd.forEach((item) => addCandidate(candidates, item.headline || item.name, item.headline ? "JSON-LD headline" : "JSON-LD name", item.headline ? 115 : 102));
    [
      ['meta[name="citation_title"]', 110],
      ['meta[property="og:title"]', 92],
      ['meta[name="twitter:title"]', 86],
      ['meta[name="DC.title"], meta[name="dcterms.title"]', 84]
    ].forEach(([selector, score]) => addCandidate(candidates, meta(selector), selector, score));
    document.querySelectorAll("article h1").forEach((el) => addCandidate(candidates, getTextSafely(el), "article h1", 104, el));
    document.querySelectorAll("main h1").forEach((el) => addCandidate(candidates, getTextSafely(el), "main h1", 101, el));
    document.querySelectorAll("h1").forEach((el) => addCandidate(candidates, getTextSafely(el), "h1", 75, el));
    document.querySelectorAll("article h2, main h2").forEach((el) => {
      const text = getTextSafely(el);
      if (text.length >= 8 && text.length <= 180) addCandidate(candidates, text, "article/main h2", 58, el);
    });
    addCandidate(candidates, document.title, "document.title", 35);
    candidates.forEach((candidate) => {
      candidate.value = cleanTitle(candidate.value, websiteName);
      candidate.score = scoreTitleCandidate(candidate);
      delete candidate.element;
      delete candidate.baseScore;
    });
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates.find((candidate) => candidate.value.length >= 5 && !BAD_TITLE.test(candidate.value));
    return { value: best?.value || cleanTitle(document.title, websiteName) || "Untitled page", source: best?.source || "document.title fallback", candidates };
  }

  function cleanAuthor(value) {
    return normalizeWhitespace(value)
      .replace(/^(?:by|written\s+by|author(?:s)?\s*:|posted\s+by)\s+/i, "")
      .replace(/\s+(?:\||·)\s+.*$/, "")
      .replace(/\s*,?\s*(?:published|updated|posted)\b.*$/i, "")
      .trim();
  }

  function splitAuthors(value) {
    const cleaned = cleanAuthor(value);
    if (!cleaned) return [];
    let pieces;
    if (/\s(?:and|&)\s|;/.test(cleaned)) pieces = cleaned.split(/\s*(?:;|\band\b|&)\s*/i);
    else if ((cleaned.match(/,/g) || []).length >= 2 && !ORG_WORDS.test(cleaned)) pieces = cleaned.split(/\s*,\s*/);
    else pieces = [cleaned];
    return pieces.map(cleanAuthor).filter((name) => name.length >= 2 && name.length <= 100);
  }

  function authorType(name) {
    return ORG_WORDS.test(name) || (!/[\u3131-\uD79D]/.test(name) && name.split(/\s+/).length > 5)
      ? "organization" : "person";
  }

  function scoreAuthorCandidate(candidate) {
    const text = cleanAuthor(candidate.value);
    let score = candidate.baseScore;
    if (text.length < 2) score -= 70;
    if (text.length > 120 || text.split(/\s+/).length > 12) score -= 55;
    if (/\b\d{4}\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(text)) score -= 45;
    if (/^https?:|@|copyright|all rights reserved/i.test(text)) score -= 55;
    return score;
  }

  function extractAuthors(jsonLd, websiteName) {
    const candidates = [];
    jsonLd.forEach((item) => {
      const authors = Array.isArray(item.author) ? item.author : item.author ? [item.author] : [];
      authors.forEach((author) => addCandidate(candidates, typeof author === "string" ? author : author.name, "JSON-LD author.name", 120));
    });
    document.querySelectorAll('meta[name="citation_author"]').forEach((el) => addCandidate(candidates, el.content, 'meta[name="citation_author"]', 115));
    [
      ['meta[name="author"]', 100],
      ['meta[property="article:author"]', 95]
    ].forEach(([selector, score]) => addCandidate(candidates, meta(selector), selector, score));
    document.querySelectorAll('[rel~="author"]').forEach((el) => addCandidate(candidates, getTextSafely(el), '[rel="author"]', 88, el));
    document.querySelectorAll('[class*="byline" i], [class*="author" i], [class*="writer" i], [class*="journalist" i], [class*="contributor" i], [id*="byline" i], [id*="author" i]').forEach((el) => {
      if (!el.closest("nav, footer")) addCandidate(candidates, getTextSafely(el), "author/byline class or id", 78, el);
    });
    const nearby = document.querySelectorAll("article p, main p, article span, main span");
    for (const el of Array.from(nearby).slice(0, 120)) {
      const text = getTextSafely(el);
      const match = text.match(/^(?:By|Written by|Author:)\s+(.{2,100})$/i);
      if (match) addCandidate(candidates, match[1], "visible byline pattern", 72, el);
    }
    candidates.forEach((candidate) => {
      candidate.value = cleanAuthor(candidate.value);
      candidate.score = scoreAuthorCandidate(candidate);
      delete candidate.element;
      delete candidate.baseScore;
    });
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates.find((candidate) => candidate.score > 20);
    const names = best ? splitAuthors(best.value) : [];
    const organizationFallback = names.length ? "" : normalizeWhitespace(websiteName);
    const finalNames = names.length ? names : organizationFallback ? [organizationFallback] : [];
    return {
      value: finalNames.map((name) => ({ name, type: names.length ? authorType(name) : "organization" })),
      source: best?.source || (organizationFallback ? "website name as organization author" : "no author found"),
      candidates
    };
  }

  function parseDate(value) {
    const raw = normalizeWhitespace(value);
    if (!raw) return null;
    const cleaned = raw.replace(/^(?:published|posted|updated|last updated|date)\s*:?\s*/i, "").replace(/(\d)(st|nd|rd|th)\b/gi, "$1");
    const iso = cleaned.match(/\b(19|20)\d{2}[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/);
    if (iso) {
      const [year, month, day] = iso[0].split(/[-/]/).map(Number);
      return { year, month, day, raw };
    }
    const months = {
      january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
      july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
    };
    let match = cleaned.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+((?:19|20)\d{2})\b/i);
    if (match) return { year: Number(match[3]), month: months[match[1].toLowerCase()], day: Number(match[2]), raw };
    match = cleaned.match(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s+((?:19|20)\d{2})\b/i);
    if (match) return { year: Number(match[3]), month: months[match[2].toLowerCase()], day: Number(match[1]), raw };
    match = cleaned.match(/\b((?:19|20)\d{2})\b/);
    if (match) return { year: Number(match[1]), month: null, day: null, raw };
    const timestamp = Date.parse(cleaned);
    if (!Number.isNaN(timestamp)) {
      const date = new Date(timestamp);
      const year = date.getFullYear();
      if (year >= 1900 && year <= new Date().getFullYear() + 1) {
        return { year, month: date.getMonth() + 1, day: date.getDate(), raw };
      }
    }
    return null;
  }

  function extractDate(jsonLd) {
    const candidates = [];
    jsonLd.forEach((item) => addCandidate(candidates, item.datePublished, "JSON-LD datePublished", 120));
    [
      ['meta[property="article:published_time"]', 112],
      ['meta[name="citation_publication_date"]', 108],
      ['meta[name="DC.date"], meta[name="dcterms.date"]', 100]
    ].forEach(([selector, score]) => addCandidate(candidates, meta(selector), selector, score));
    document.querySelectorAll("time[datetime]").forEach((el) => addCandidate(candidates, el.getAttribute("datetime"), "time[datetime]", 90, el));
    document.querySelectorAll('[class*="date" i], [class*="published" i], [class*="posted" i], [id*="date" i], [id*="published" i]').forEach((el) => {
      if (!el.closest("footer, nav")) addCandidate(candidates, getTextSafely(el), "date/published/posted class or id", 65, el);
    });
    const bodyStart = normalizeWhitespace((document.querySelector("article, main") || document.body)?.innerText || "").slice(0, 2500);
    const patterns = [
      /\b(?:19|20)\d{2}[-/](?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12]\d|3[01])\b/,
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+(?:19|20)\d{2}\b/i,
      /\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:19|20)\d{2}\b/i
    ];
    for (const pattern of patterns) {
      const match = bodyStart.match(pattern);
      if (match) { addCandidate(candidates, match[0], "near-body date pattern", 48); break; }
    }
    candidates.forEach((candidate) => {
      candidate.parsed = parseDate(candidate.value);
      candidate.score = candidate.baseScore + (candidate.parsed ? 10 : -100);
      delete candidate.element;
      delete candidate.baseScore;
    });
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates.find((candidate) => candidate.parsed);
    return { value: best?.parsed || null, source: best?.source || "no publication date found", candidates: candidates.map(({ parsed, ...item }) => item) };
  }

  function inferPageType(jsonLd) {
    const types = jsonLd.flatMap((item) => Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]]).filter(Boolean).join(" ");
    const host = location.hostname;
    if (/ScholarlyArticle/i.test(types) || meta('meta[name="citation_journal_title"]')) return "academic";
    if (/NewsArticle|ReportageNewsArticle/i.test(types)) return "news";
    if (/BlogPosting/i.test(types)) return "blog";
    if (/Article/i.test(types) || document.querySelector("article")) return "article";
    if (/\.(gov|go\.[a-z]{2})$/i.test(host) || /\bgovernment\b/i.test(types)) return "government";
    return "generic webpage";
  }

  function extractPageData() {
    const jsonLd = parseJsonLd();
    const website = extractWebsiteName(jsonLd);
    const title = extractTitle(jsonLd, website.value);
    const authors = extractAuthors(jsonLd, website.value);
    const date = extractDate(jsonLd);
    const publisher = extractPublisher(jsonLd, website.value);
    return {
      title: title.value,
      authors: authors.value,
      date: date.value,
      year: date.value?.year || null,
      websiteName: website.value,
      publisher: publisher.value,
      url: location.href,
      accessedDate: new Date().toISOString(),
      pageType: inferPageType(jsonLd),
      debug: {
        titleSource: title.source,
        authorSource: authors.source,
        dateSource: date.source,
        websiteSource: website.source,
        publisherSource: publisher.source,
        titleCandidates: title.candidates,
        authorCandidates: authors.candidates,
        dateCandidates: date.candidates
      }
    };
  }

  root.APAExtractor = {
    extractPageData,
    extractTitle,
    extractAuthors,
    extractDate,
    extractWebsiteName,
    extractPublisher,
    parseJsonLd,
    cleanTitle,
    cleanAuthor,
    parseDate,
    scoreTitleCandidate,
    scoreAuthorCandidate,
    getTextSafely,
    normalizeWhitespace
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
