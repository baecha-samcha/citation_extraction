(function (root) {
  "use strict";

  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  function normalize(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function escapeHTML(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function toSentenceCase(title) {
    const value = normalize(title);
    if (!value) return "Untitled page";
    const words = value.split(" ");
    const letters = value.match(/[A-Za-z]/g) || [];
    const uppercaseRatio = letters.length
      ? letters.filter((letter) => letter === letter.toUpperCase()).length / letters.length
      : 0;
    if (uppercaseRatio < 0.72 || letters.length < 8) return value;

    return words.map((word, index) => {
      if (/^(?:API|AI|APA|DOI|HTML|CSS|JSON|URL|URI|USA|UK|EU|UN|WHO|NASA|COVID-19|[A-Z]\d+|\d+[A-Z]+)$/.test(word)) return word;
      const lowered = word.toLowerCase();
      return index === 0
        ? lowered.charAt(0).toUpperCase() + lowered.slice(1)
        : lowered;
    }).join(" ");
  }

  function formatPersonName(name) {
    const value = normalize(name);
    if (!value || /[\u3131-\uD79D]/.test(value)) return value;
    if (value.includes(",")) return value;
    const parts = value.split(/\s+/);
    if (parts.length < 2 || parts.length > 5) return value;
    if (/\b(University|Institute|Ministry|Department|Agency|Association|Company|Council|Organization|Organisation|Inc\.?|Ltd\.?|Team|Staff)\b/i.test(value)) {
      return value;
    }
    const suffixes = /^(Jr\.?|Sr\.?|II|III|IV)$/i;
    const suffix = suffixes.test(parts[parts.length - 1]) ? parts.pop() : "";
    const last = parts.pop();
    const initials = parts
      .filter(Boolean)
      .map((part) => part.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ'-]/g, ""))
      .filter(Boolean)
      .map((part) => `${part.charAt(0).toUpperCase()}.`)
      .join(" ");
    return `${last}, ${initials}${suffix ? `, ${suffix}` : ""}`.trim();
  }

  function formatAuthors(authors) {
    const list = Array.isArray(authors)
      ? authors
      : String(authors || "").split(/\s*(?:;|\band\b|&)\s*/i);
    const formatted = list.map((author) => {
      const name = typeof author === "object" ? author.name : author;
      const organization = typeof author === "object" && author.type === "organization";
      return organization ? normalize(name) : formatPersonName(name);
    }).filter(Boolean);
    if (formatted.length === 0) return "";
    if (formatted.length === 1) return formatted[0];
    if (formatted.length === 2) return `${formatted[0]}, & ${formatted[1]}`;
    if (formatted.length > 20) {
      return `${formatted.slice(0, 19).join(", ")}, ... ${formatted[formatted.length - 1]}`;
    }
    return `${formatted.slice(0, -1).join(", ")}, & ${formatted[formatted.length - 1]}`;
  }

  function formatDate(date) {
    if (!date || date === "n.d." || !date.year) return "n.d.";
    const year = String(date.year);
    const month = Number(date.month);
    const day = Number(date.day);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}, ${MONTHS[month - 1]} ${day}`;
    }
    if (month >= 1 && month <= 12) return `${year}, ${MONTHS[month - 1]}`;
    return year;
  }

  function formatRetrievalDate(date) {
    const value = date instanceof Date ? date : new Date(date || Date.now());
    if (Number.isNaN(value.getTime())) return "";
    return `${MONTHS[value.getMonth()]} ${value.getDate()}, ${value.getFullYear()}`;
  }

  function comparable(value) {
    return normalize(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  }

  function shouldOmitWebsiteName(author, websiteName) {
    const authorText = Array.isArray(author)
      ? author.map((item) => typeof item === "object" ? item.name : item).join(" ")
      : typeof author === "object" ? author.name : author;
    return Boolean(authorText && websiteName && comparable(authorText) === comparable(websiteName));
  }

  function buildParts(data, html) {
    const authors = formatAuthors(data.authors || data.author);
    const date = formatDate(data.date);
    const title = toSentenceCase(data.title);
    const website = normalize(data.websiteName);
    const url = normalize(data.url);
    const titlePart = html ? `<i>${escapeHTML(title)}</i>` : `*${title}*`;
    const parts = [];

    if (authors) {
      const authorText = /[.!?]$/.test(authors) ? authors : `${authors}.`;
      parts.push(html ? escapeHTML(authorText) : authorText);
      parts.push(`(${html ? escapeHTML(date) : date}).`);
      parts.push(`${titlePart}.`);
    } else {
      parts.push(`${titlePart}.`);
      parts.push(`(${html ? escapeHTML(date) : date}).`);
    }
    if (website && !shouldOmitWebsiteName(data.authors || data.author, website)) {
      parts.push(`${html ? escapeHTML(website) : website}.`);
    }
    if (data.includeRetrievalDate) {
      const retrieval = formatRetrievalDate(data.accessedDate);
      parts.push(`Retrieved ${html ? escapeHTML(retrieval) : retrieval}, from ${html ? escapeHTML(url) : url}`);
    } else if (url) {
      parts.push(html ? escapeHTML(url) : url);
    }
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function formatAPA7Plain(data) {
    return buildParts(data || {}, false);
  }

  function formatAPA7HTML(data) {
    return buildParts(data || {}, true);
  }

  root.CitationFormatter = {
    formatAPA7Plain,
    formatAPA7HTML,
    formatAuthors,
    formatDate,
    toSentenceCase,
    formatRetrievalDate,
    shouldOmitWebsiteName,
    escapeHTML
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
