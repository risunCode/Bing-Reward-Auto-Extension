// Background service worker (MV3, module type)
// Opens Bing search tabs sequentially with configurable delay

let cancelRequested = false;
let pendingDelay = null; // { timeoutId, resolve }

function cancelDelay() {
  try {
    if (pendingDelay) {
      clearTimeout(pendingDelay.timeoutId);
      pendingDelay.resolve();
      pendingDelay = null;
    }
  } catch {}
}

import { fetchAllSuggestionsDirect } from "../modules/api/suggest.js";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  try {
    if (!message) return;

    if (message.type === 'FETCH_SUGGEST') {
      const seed = String(message.seed || '').trim();
      const mkt = String(message.mkt || 'id-ID');
      if (!seed) { sendResponse([]); return true; }
      (async () => {
        try {
          const arr = await fetchAllSuggestionsDirect(seed, mkt);
          sendResponse(Array.isArray(arr) ? arr : []);
        } catch {
          sendResponse([]);
        }
      })();
      return true; // async response
    }

    if (message.type === 'STOP_ALL') {
      console.warn('[BG] Emergency STOP received');
      cancelRequested = true;
      cancelDelay();
      return; // do not proceed further for STOP messages
    }

    if (message.type !== "OPEN_BING_TABS") return;

    const payload = message.payload || {};
    const queries = Array.isArray(payload.queries) ? payload.queries : [];
    const searchId = typeof payload.searchId === 'string' ? payload.searchId : '';
    const delayMs = Number.isFinite(payload.delayMs) && payload.delayMs >= 0 ? payload.delayMs : 3000;

    if (queries.length === 0 || !searchId) {
      console.error("Invalid payload:", payload);
      return;
    }

    cancelRequested = false; // reset for this run
    console.log(`Opening ${queries.length} tabs with ${delayMs}ms delay`);

    (async () => {
      for (let i = 0; i < queries.length; i++) {
        if (cancelRequested) {
          console.warn('[BG] Opening cancelled');
          break;
        }
        const q = String(queries[i] ?? '').trim();
        if (!q) continue;
        const url = new URL("https://www.bing.com/search");
        url.searchParams.set("q", q);
        url.searchParams.set("form", searchId);

        try {
          console.log(`Opening tab ${i + 1}/${queries.length}: ${q}`);
          const tab = await chrome.tabs.create({ url: url.toString(), active: true });
          if (tab && tab.windowId != null) {
            // Ensure the window is focused as well
            try { await chrome.windows.update(tab.windowId, { focused: true }); } catch {}
          }

          // Don't delay after the last tab
          if (i < queries.length - 1) {
            if (cancelRequested) break;
            console.log(`Waiting ${delayMs}ms before next tab...`);
            await new Promise(resolve => {
              const timeoutId = setTimeout(() => {
                pendingDelay = null;
                resolve();
              }, delayMs);
              pendingDelay = { timeoutId, resolve };
            });
          }
        } catch (e) {
          console.error("Failed to create tab for:", q, e);
        }
      }
      pendingDelay = null;
      if (!cancelRequested) {
        console.log("All tabs opened successfully");
      } else {
        console.warn("Opening stopped by user");
      }
    })();
  } catch (err) {
    console.error('Unhandled error in service worker:', err);
  }
});
