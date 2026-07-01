(function () {
  "use strict";

  if (globalThis.__apaCitationContentScriptInstalled) return;
  globalThis.__apaCitationContentScriptInstalled = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== "EXTRACT_PAGE_DATA") return false;
    try {
      if (!globalThis.APAExtractor) throw new Error("Extractor module is unavailable.");
      sendResponse({ ok: true, data: globalThis.APAExtractor.extractPageData() });
    } catch (error) {
      sendResponse({ ok: false, error: error.message || String(error) });
    }
    return false;
  });
})();
