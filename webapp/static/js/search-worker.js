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

function postSearchError(requestId, mode, error, status) {
  globalThis.postMessage({
    type: "error",
    request_id: requestId,
    error: errorText(error),
    search: {
      mode: mode,
      status: status,
      optimality_proven: false,
    },
  });
}

globalThis.addEventListener("message", function (event) {
  const message = event.data;
  if (message?.type !== "search") {
    return;
  }

  const requestId = message.request_id;
  const mode = message.request?.search_mode === "fast" ? "fast" : "exact";
  if (engineLoadError) {
    postSearchError(requestId, mode, engineLoadError, "error");
    return;
  }

  const engine = globalThis.Schedule1Search;
  if (!engine || typeof engine.search !== "function") {
    postSearchError(requestId, mode, new Error("The local search engine is unavailable."), "error");
    return;
  }

  try {
    const result = engine.search(message.catalog, message.request, {
      onProgress(progress) {
        globalThis.postMessage({
          type: "progress",
          request_id: requestId,
          progress: progress,
        });
      },
    });
    globalThis.postMessage({ type: "result", request_id: requestId, result: result });
  } catch (error) {
    const limitExceeded =
      typeof engine.SearchLimitExceeded === "function" &&
      error instanceof engine.SearchLimitExceeded;
    postSearchError(requestId, mode, error, limitExceeded ? "incomplete" : "error");
  }
});
