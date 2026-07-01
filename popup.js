(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const fields = ["title", "author", "date", "websiteName", "publisher", "url"];
  let extractedData = null;
  let statusTimer = null;

  function showStatus(message, kind = "info", autoHide = false) {
    const status = $("status");
    clearTimeout(statusTimer);
    status.textContent = message;
    status.className = `status visible ${kind}`;
    if (autoHide) {
      statusTimer = setTimeout(() => { status.className = "status"; }, 2600);
    }
  }

  function parseAuthorsInput(value) {
    return value.split(/\s*(?:;|\n)\s*/).map((name) => name.trim()).filter(Boolean).map((name) => {
      const existing = extractedData?.authors?.find((author) => author.name === name);
      return existing || { name, type: /[\u3131-\uD79D]/.test(name) ? "person" : "person" };
    });
  }

  function getFormData() {
    const parsedDate = $("date").value.trim().toLowerCase() === "n.d."
      ? null
      : globalThis.APAExtractor?.parseDate?.($("date").value.trim()) || parseDateForPopup($("date").value.trim());
    return {
      title: $("title").value.trim(),
      authors: parseAuthorsInput($("author").value),
      date: parsedDate,
      websiteName: $("websiteName").value.trim(),
      publisher: $("publisher").value.trim(),
      url: $("url").value.trim(),
      accessedDate: extractedData?.accessedDate || new Date().toISOString(),
      includeRetrievalDate: $("includeRetrievalDate").checked
    };
  }

  function parseDateForPopup(value) {
    if (!value) return null;
    const iso = value.match(/^(\d{4})(?:[-/](\d{1,2}))?(?:[-/](\d{1,2}))?$/);
    if (iso) return { year: Number(iso[1]), month: iso[2] ? Number(iso[2]) : null, day: iso[3] ? Number(iso[3]) : null };
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) {
      const year = value.match(/\b(19|20)\d{2}\b/);
      return year ? { year: Number(year[0]), month: null, day: null } : null;
    }
    const date = new Date(timestamp);
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
  }

  function updatePreview() {
    if (!extractedData) return;
    $("preview").innerHTML = CitationFormatter.formatAPA7HTML(getFormData());
  }

  function dateToInput(date) {
    if (!date?.year) return "n.d.";
    if (!date.month) return String(date.year);
    if (!date.day) return `${date.year}-${String(date.month).padStart(2, "0")}`;
    return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
  }

  function populate(data) {
    extractedData = data;
    $("title").value = data.title || "Untitled page";
    $("author").value = (data.authors || []).map((author) => author.name || author).join("; ");
    $("date").value = dateToInput(data.date);
    $("websiteName").value = data.websiteName || "";
    $("publisher").value = data.publisher || "";
    $("url").value = data.url || "";
    $("pageType").textContent = `Detected type: ${data.pageType || "generic webpage"}`;
    $("copy").disabled = false;
    renderDebug(data.debug || {});
    updatePreview();
  }

  function addCandidateList(container, title, candidates) {
    const heading = document.createElement("h3");
    heading.textContent = title;
    container.appendChild(heading);
    const list = document.createElement("ol");
    if (!candidates?.length) {
      const item = document.createElement("li");
      item.textContent = "No candidates";
      list.appendChild(item);
    } else {
      candidates.forEach((candidate) => {
        const item = document.createElement("li");
        item.textContent = `[${candidate.score}] ${candidate.source}: ${candidate.value}`;
        list.appendChild(item);
      });
    }
    container.appendChild(list);
  }

  function renderDebug(debug) {
    const container = $("debug");
    container.replaceChildren();
    const source = document.createElement("div");
    source.className = "source";
    source.textContent = [
      `Title: ${debug.titleSource || "unknown"}`,
      `Author: ${debug.authorSource || "unknown"}`,
      `Date: ${debug.dateSource || "unknown"}`,
      `Website: ${debug.websiteSource || "unknown"}`,
      `Publisher: ${debug.publisherSource || "unknown"}`
    ].join("\n");
    container.appendChild(source);
    addCandidateList(container, "Title candidates", debug.titleCandidates);
    addCandidateList(container, "Author candidates", debug.authorCandidates);
    addCandidateList(container, "Date candidates", debug.dateCandidates);
  }

  function isRestrictedUrl(url) {
    return /^(chrome|edge|about|brave|opera|vivaldi|chrome-extension|moz-extension):/i.test(url || "");
  }

  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) throw new Error("No active tab was found.");
    return tabs[0];
  }

  function sendExtractionMessage(tabId) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { type: "EXTRACT_PAGE_DATA" }, (response) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response?.ok) return reject(new Error(response?.error || "The page did not return extraction data."));
        resolve(response.data);
      });
    });
  }

  async function extract() {
    $("copy").disabled = true;
    showStatus("Analyzing page metadata and structure…", "info");
    try {
      const tab = await getActiveTab();
      if (isRestrictedUrl(tab.url)) {
        throw new Error("Chrome does not allow extensions to analyze this internal page. Open a regular http or https page.");
      }
      let data;
      try {
        data = await sendExtractionMessage(tab.id);
      } catch (_) {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["extractor.js", "contentScript.js"] });
        data = await sendExtractionMessage(tab.id);
      }
      populate(data);
      showStatus("Extraction complete. You can edit every field.", "success", true);
    } catch (error) {
      showStatus(`Unable to analyze this page: ${error.message}`, "error");
      $("pageType").textContent = "Extraction unavailable";
    }
  }

  async function copyCitation() {
    const data = getFormData();
    const plain = CitationFormatter.formatAPA7Plain(data);
    const html = CitationFormatter.formatAPA7HTML(data);
    try {
      if (navigator.clipboard?.write && globalThis.ClipboardItem) {
        const item = new ClipboardItem({
          "text/plain": new Blob([plain], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" })
        });
        await navigator.clipboard.write([item]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      showStatus("Citation copied to the clipboard.", "success", true);
    } catch (richError) {
      try {
        await navigator.clipboard.writeText(plain);
        showStatus("Citation copied as plain text.", "success", true);
      } catch (_) {
        showStatus(`Copy failed: ${richError.message}`, "error");
      }
    }
  }

  fields.forEach((id) => $(id).addEventListener("input", updatePreview));
  $("includeRetrievalDate").addEventListener("change", () => {
    chrome.storage.local.set({ includeRetrievalDate: $("includeRetrievalDate").checked });
    updatePreview();
  });
  $("copy").addEventListener("click", copyCitation);
  $("reextract").addEventListener("click", extract);

  chrome.storage.local.get({ includeRetrievalDate: false }, (settings) => {
    $("includeRetrievalDate").checked = Boolean(settings.includeRetrievalDate);
    extract();
  });
})();
