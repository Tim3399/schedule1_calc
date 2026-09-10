document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("best-mix-form");
  const resultDiv = document.getElementById("result");
  const submitButton = form.querySelector('button[type="submit"]');
  const cancelButton = document.getElementById("cancel-search");
  const searchDataUrl = form.dataset.searchDataUrl;
  const workerUrl = form.dataset.workerUrl;
  let catalogCache = null;
  let activeRun = null;
  let nextRequestId = 1;

  function appendTextElement(parent, tagName, text) {
    const element = document.createElement(tagName);
    element.textContent = text;
    parent.appendChild(element);
  }

  function renderCombination(title, combination) {
    appendTextElement(resultDiv, "h2", title);
    appendTextElement(resultDiv, "p", `Effects: ${combination.effects.join(", ")}`);
    appendTextElement(resultDiv, "p", `Ingredients: ${combination.substances.join(", ")}`);
    appendTextElement(resultDiv, "p", `Modifier: ${combination.modifier.toFixed(2)}`);
    appendTextElement(resultDiv, "p", `Sell Price: ${combination.sell_price.toFixed(2)}$`);
    appendTextElement(resultDiv, "p", `Ingredient Cost: ${combination.substance_cost.toFixed(2)}$`);
    appendTextElement(
      resultDiv,
      "p",
      `Profit: ${(combination.sell_price - combination.substance_cost).toFixed(2)}$`,
    );
  }

  function renderMessage(message, { error = false } = {}) {
    const element = document.createElement("p");
    if (error) {
      element.className = "error";
      element.setAttribute("role", "alert");
    } else {
      element.setAttribute("role", "status");
    }
    element.textContent = message;
    resultDiv.replaceChildren(element);
  }

  function setBusy(busy) {
    submitButton.disabled = busy;
    cancelButton.hidden = !busy;
    form.setAttribute("aria-busy", String(busy));
  }

  function stopRun(run) {
    clearTimeout(run.watchdog);
    run.abortController.abort();
    if (run.worker) {
      run.worker.terminate();
      run.worker = null;
    }
    if (activeRun === run) {
      activeRun = null;
      setBusy(false);
    }
  }

  function failRun(run, message) {
    if (activeRun !== run) {
      return;
    }
    stopRun(run);
    renderMessage(`${message} No result was produced.`, { error: true });
  }

  function isCombination(combination) {
    return (
      combination &&
      Array.isArray(combination.effects) &&
      combination.effects.every((effect) => typeof effect === "string") &&
      Array.isArray(combination.substances) &&
      combination.substances.length > 0 &&
      combination.substances.every(
        (substance) => typeof substance === "string" && substance.length > 0,
      ) &&
      Number.isFinite(combination.modifier) &&
      Number.isFinite(combination.sell_price) &&
      Number.isFinite(combination.substance_cost)
    );
  }

  function resultMatchesMode(result, requestedMode) {
    const search = result?.search;
    const exactResult =
      requestedMode === "exact" &&
      search?.mode === requestedMode &&
      search.status === "optimal" &&
      search.optimality_proven === true;
    const fastResult =
      requestedMode === "fast" &&
      search?.mode === requestedMode &&
      search.status === "approximate" &&
      search.optimality_proven === false;
    return (
      !result?.error &&
      (exactResult || fastResult) &&
      isCombination(result.best_modifier) &&
      isCombination(result.best_profit)
    );
  }

  function renderResult(result, requestedMode) {
    resultDiv.replaceChildren();
    if (requestedMode === "exact") {
      appendTextElement(resultDiv, "p", "Optimality proven");
      renderCombination("Best Modifier Combination", result.best_modifier);
      renderCombination("Best Profit Combination", result.best_profit);
    } else {
      appendTextElement(resultDiv, "p", "Approximate result — optimality not guaranteed");
      renderCombination("Highest modifier found", result.best_modifier);
      renderCombination("Highest profit found", result.best_profit);
    }
  }

  function progressText(progress) {
    const details = [];
    if (Number.isInteger(progress?.depth) && progress.depth >= 0) {
      if (Number.isInteger(progress.max_depth) && progress.max_depth >= progress.depth) {
        details.push(`depth ${progress.depth} of ${progress.max_depth}`);
      } else {
        details.push(`depth ${progress.depth}`);
      }
    }
    const work =
      progress?.work ??
      progress?.work_units ??
      progress?.expanded ??
      progress?.expanded_transitions ??
      progress?.generated_candidates;
    if (Number.isFinite(work) && work >= 0) {
      details.push(`${Math.trunc(work).toLocaleString()} operations`);
    }
    return details.length > 0 ? `Searching locally — ${details.join("; ")}` : "Searching locally…";
  }

  async function loadCatalog(run) {
    if (catalogCache) {
      return catalogCache;
    }
    const response = await fetch(searchDataUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-cache",
      signal: run.abortController.signal,
    });
    if (!response.ok) {
      throw new Error(`Could not load search data (HTTP ${response.status}).`);
    }
    const catalog = await response.json();
    if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
      throw new Error("The search data response was invalid.");
    }
    catalogCache = catalog;
    return catalog;
  }

  function startWorker(run, catalog) {
    if (activeRun !== run) {
      return;
    }
    const worker = new Worker(workerUrl);
    run.worker = worker;
    worker.addEventListener("message", function (event) {
      const message = event.data;
      if (activeRun !== run || message?.request_id !== run.requestId) {
        return;
      }
      if (message.type === "progress") {
        renderMessage(progressText(message.progress));
        return;
      }
      if (message.type === "result") {
        if (!resultMatchesMode(message.result, run.mode)) {
          failRun(run, "The local search returned an invalid or incomplete response.");
          return;
        }
        const result = message.result;
        stopRun(run);
        renderResult(result, run.mode);
        return;
      }
      if (message.type === "error") {
        const metadata = message.search;
        const validError =
          !message.best_modifier &&
          !message.best_profit &&
          metadata?.mode === run.mode &&
          (metadata.status === "incomplete" || metadata.status === "error") &&
          metadata.optimality_proven === false;
        failRun(
          run,
          validError && typeof message.error === "string"
            ? message.error
            : "The local search failed with an invalid response.",
        );
        return;
      }
      failRun(run, "The local search returned an unknown response.");
    });
    worker.addEventListener("error", function (event) {
      event.preventDefault();
      failRun(run, "The local search could not run in this browser.");
    });
    worker.addEventListener("messageerror", function () {
      failRun(run, "The browser could not read the local search response.");
    });
    worker.postMessage({
      type: "search",
      request_id: run.requestId,
      request: run.request,
      catalog: catalog,
    });
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (activeRun) {
      return;
    }

    const mode = document.getElementById("search-mode").value;
    const request = {
      level: document.getElementById("level").value,
      combination_size: Number(document.getElementById("combination-size").value),
      product_name: document.getElementById("product-name").value,
      search_mode: mode,
    };
    const run = {
      requestId: nextRequestId,
      request: request,
      mode: mode,
      abortController: new AbortController(),
      worker: null,
      watchdog: null,
    };
    nextRequestId += 1;
    activeRun = run;
    setBusy(true);
    renderMessage("Loading search data for local computation…");
    const timeout = mode === "exact" ? 95_000 : 20_000;
    run.watchdog = setTimeout(function () {
      failRun(run, "The local search timed out.");
    }, timeout);

    try {
      const catalog = await loadCatalog(run);
      startWorker(run, catalog);
    } catch (error) {
      if (activeRun === run && error.name !== "AbortError") {
        failRun(run, error instanceof Error ? error.message : "Could not load search data.");
      }
    }
  });

  cancelButton.addEventListener("click", function () {
    if (!activeRun) {
      return;
    }
    const run = activeRun;
    stopRun(run);
    renderMessage("Search cancelled. No result was produced.", { error: true });
  });

  window.addEventListener("pagehide", function () {
    if (activeRun) {
      stopRun(activeRun);
    }
  });

  if (typeof Worker !== "function" || typeof AbortController !== "function") {
    renderMessage("This browser cannot run the calculator locally.", { error: true });
    return;
  }
  setBusy(false);
});
