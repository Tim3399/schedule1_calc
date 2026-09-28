let engineLoadError = null;

try {
  importScripts("search-engine.js");
} catch (error) {
  engineLoadError = error;
}

function errorText(error) {
  return typeof error?.message === "string" && error.message
    ? error.message
    : "Local search failed.";
}

function postSearchError(requestId, mode, error, status, limitExceeded = false) {
  const message = {
    type: "error",
    request_id: requestId,
    error: errorText(error),
    search: {
      mode: mode,
      status: status,
      optimality_proven: false,
    },
  };
  if (limitExceeded) {
    if (typeof error.reason === "string" && error.reason) message.reason = error.reason;
    if (error.partial_result !== undefined && error.partial_result !== null) {
      message.result = error.partial_result;
    }
  }
  globalThis.postMessage(message);
}

globalThis.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || !["search", "search_effects"].includes(message.type)) {
    return;
  }

  const requestId = message.request_id;
  const mode = message.request?.search_mode === "fast" ? "fast" : "exact";
  if (engineLoadError) {
    postSearchError(requestId, mode, engineLoadError, "error");
    return;
  }

  const engine = globalThis.Schedule1Search;
  const searchMethod = message.type === "search_effects" ? "searchEffects" : "search";
  if (!engine || typeof engine[searchMethod] !== "function") {
    postSearchError(requestId, mode, new Error("The local search engine is unavailable."), "error");
    return;
  }

  try {
    const result = engine[searchMethod](message.catalog, message.request, {
      onProgress(progress) {
        globalThis.postMessage({
          type: "progress",
          request_id: requestId,
          progress: progress,
        });
      },
      onCheckpoint(result) {
        globalThis.postMessage({
          type: "checkpoint",
          request_id: requestId,
          result: result,
        });
      },
    });
    globalThis.postMessage({ type: "result", request_id: requestId, result: result });
  } catch (error) {
    const limitExceeded =
      typeof engine.SearchLimitExceeded === "function" &&
      error instanceof engine.SearchLimitExceeded;
    postSearchError(requestId, mode, error, limitExceeded ? "incomplete" : "error", limitExceeded);
  }
});
