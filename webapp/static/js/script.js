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

  function humanizeIdentifier(identifier) {
    const overrides = {
      high_quality_pesudo: "High Quality Pseudo",
      low_quality_pesudo: "Low Quality Pseudo",
    };
    if (Object.hasOwn(overrides, identifier)) {
      return overrides[identifier];
    }
    const romanRanks = new Set(["i", "ii", "iii", "iv", "v"]);
    return identifier
      .split("_")
      .map((word) => {
        const suffix = word.endsWith("+") ? "+" : "";
        const base = suffix ? word.slice(0, -1) : word;
        if (base === "og" || romanRanks.has(base)) {
          return `${base.toUpperCase()}${suffix}`;
        }
        return `${base.charAt(0).toUpperCase()}${base.slice(1)}${suffix}`;
      })
      .join(" ");
  }

  function displayName(catalog, collectionName, identifier) {
    const collection = catalog?.[collectionName];
    const item = Array.isArray(collection)
      ? collection.find(
          (entry) => entry !== null && typeof entry === "object" && entry.name === identifier,
        )
      : undefined;
    return typeof item?.display_name === "string" && item.display_name
      ? item.display_name
      : humanizeIdentifier(identifier);
  }

  function readableMessage(message, catalog) {
    let readable = message;
    const entries = [];
    const levelNames = catalog?.level_display_names;
    if (levelNames !== null && typeof levelNames === "object" && !Array.isArray(levelNames)) {
      entries.push(...Object.entries(levelNames));
    }
    for (const collectionName of ["effects", "products", "substances"]) {
      const collection = catalog?.[collectionName];
      if (!Array.isArray(collection)) {
        continue;
      }
      for (const item of collection) {
        if (item !== null && typeof item === "object") {
          entries.push([item.name, item.display_name]);
        }
      }
    }
    const validEntries = entries
      .filter(
        ([identifier, label]) =>
          typeof identifier === "string" &&
          identifier.length > 0 &&
          typeof label === "string" &&
          label.length > 0,
      )
      .sort(([left], [right]) => right.length - left.length);
    for (const [identifier, label] of validEntries) {
      const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const token = new RegExp(`(^|[^a-z0-9_+])${escaped}(?=$|[^a-z0-9_+])`, "g");
      readable = readable.replace(token, (match, prefix) => `${prefix}${label}`);
    }
    return readable.replace(/\b[a-z0-9]+(?:_[a-z0-9+]+)+\b/g, humanizeIdentifier);
  }

  function renderCombination(title, combination, catalog, destination = resultDiv) {
    appendTextElement(destination, "h2", title);
    appendTextElement(
      destination,
      "p",
      `Effects: ${combination.effects.map((name) => displayName(catalog, "effects", name)).join(", ") || "None"}`,
    );
    appendTextElement(
      destination,
      "p",
      `Ingredients: ${combination.substances.map((name) => displayName(catalog, "substances", name)).join(", ") || "None"}`,
    );
    appendTextElement(destination, "p", `Modifier: ${combination.modifier.toFixed(2)}`);
    appendTextElement(destination, "p", `Sell Price: ${combination.sell_price.toFixed(2)}$`);
    appendTextElement(
      destination,
      "p",
      `Ingredient Cost: ${combination.substance_cost.toFixed(2)}$`,
    );
    appendTextElement(
      destination,
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
    renderMessage(`${readableMessage(message, run.catalog)} No result was produced.`, {
      error: true,
    });
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

  function renderResult(result, requestedMode, catalog) {
    resultDiv.replaceChildren();
    if (requestedMode === "exact") {
      appendTextElement(resultDiv, "p", "Optimality proven");
      renderCombination("Best Modifier Combination", result.best_modifier, catalog);
      renderCombination("Best Profit Combination", result.best_profit, catalog);
    } else {
      appendTextElement(resultDiv, "p", "Approximate result — optimality not guaranteed");
      renderCombination("Highest modifier found", result.best_modifier, catalog);
      renderCombination("Highest profit found", result.best_profit, catalog);
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
    run.catalog = catalog;
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
        renderResult(result, run.mode, catalog);
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
      catalog: null,
    };
    nextRequestId += 1;
    activeRun = run;
    setBusy(true);
    renderMessage("Loading search data for local computation…");
    const timeout = mode === "exact" ? 305_000 : 20_000;
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

  function initializeRecipeTab() {
    const recipeForm = document.getElementById("recipe-form");
    if (!recipeForm) {
      return;
    }
    const tabs = [document.getElementById("search-tab"), document.getElementById("recipe-tab")];
    const panels = [
      document.getElementById("search-panel"),
      document.getElementById("recipe-panel"),
    ];
    const product = document.getElementById("recipe-product");
    const ingredient = document.getElementById("recipe-ingredient");
    const addButton = document.getElementById("add-ingredient");
    const clearButton = document.getElementById("clear-recipe");
    const retryButton = document.getElementById("retry-recipe");
    const steps = document.getElementById("recipe-steps");
    const count = document.getElementById("recipe-count");
    const empty = document.getElementById("recipe-empty");
    const output = document.getElementById("recipe-result");
    const recipe = [];
    let catalog = null;
    let loading = false;
    let loadController = null;

    function renderRecipe() {
      output.replaceChildren();
      try {
        const result = window.Schedule1Search.evaluateRecipe(catalog, {
          product_name: product.value,
          substances: recipe,
        });
        renderCombination("Your Recipe Result", result, catalog, output);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not calculate this recipe.";
        appendTextElement(output, "p", readableMessage(message, catalog));
      }
    }

    function fillIngredients(select, selected) {
      select.replaceChildren();
      for (const substance of catalog.substances) {
        const option = document.createElement("option");
        option.value = substance.name;
        option.textContent = `${displayName(catalog, "substances", substance.name)} — ${(substance.price_cents / 100).toFixed(2)}$`;
        select.appendChild(option);
      }
      if (selected) {
        select.value = selected;
      }
    }

    function renderSteps(focusIndex = null, focusAction = "ingredient") {
      steps.replaceChildren();
      const focusTargets = [];
      recipe.forEach((name, index) => {
        const row = document.createElement("li");
        const select = document.createElement("select");
        select.setAttribute("aria-label", `Ingredient ${index + 1}`);
        fillIngredients(select, name);
        select.addEventListener("change", function () {
          recipe[index] = select.value;
          renderRecipe();
        });
        row.appendChild(select);
        const controls = document.createElement("div");
        controls.className = "recipe-step-controls";
        const targets = { ingredient: select };
        for (const [action, label, disabled] of [
          ["up", "Move Up", index === 0],
          ["down", "Move Down", index === recipe.length - 1],
          ["remove", "Remove", false],
        ]) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = label;
          button.disabled = disabled;
          button.setAttribute("aria-label", `${label} ingredient ${index + 1}`);
          button.addEventListener("click", function () {
            if (action === "remove") {
              recipe.splice(index, 1);
              renderSteps(Math.min(index, recipe.length - 1));
            } else {
              const next = index + (action === "up" ? -1 : 1);
              [recipe[index], recipe[next]] = [recipe[next], recipe[index]];
              renderSteps(next, action);
            }
            renderRecipe();
          });
          controls.appendChild(button);
          targets[action] = button;
        }
        row.appendChild(controls);
        steps.appendChild(row);
        focusTargets.push(targets);
      });
      count.textContent = `(${recipe.length} ${recipe.length === 1 ? "ingredient" : "ingredients"})`;
      clearButton.disabled = recipe.length === 0;
      empty.hidden = recipe.length !== 0;
      if (focusIndex !== null) {
        const target = focusTargets[focusIndex]?.[focusAction];
        (target && !target.disabled
          ? target
          : focusTargets[focusIndex]?.ingredient || ingredient
        ).focus();
      }
    }

    async function prepareRecipe() {
      if (catalog || loading) {
        return;
      }
      loading = true;
      let loadTimeout = null;
      retryButton.hidden = true;
      output.replaceChildren();
      appendTextElement(output, "p", "Loading recipe data for local computation…");
      try {
        if (typeof window.Schedule1Search?.evaluateRecipe !== "function") {
          throw new Error("The recipe calculator could not load. Reload the page to try again.");
        }
        loadController = new AbortController();
        loadTimeout = setTimeout(() => loadController.abort(), 15_000);
        const loaded = await loadCatalog({ abortController: loadController });
        window.Schedule1Search.validateCatalog(loaded, 0);
        catalog = loaded;
        fillIngredients(ingredient);
        product.disabled = false;
        ingredient.disabled = false;
        addButton.disabled = false;
        renderRecipe();
      } catch (error) {
        catalogCache = null;
        output.replaceChildren();
        const message =
          error?.name === "AbortError"
            ? "Loading recipe data was interrupted. Please try again."
            : error instanceof Error
              ? error.message
              : "Could not load recipe data.";
        appendTextElement(output, "p", readableMessage(message, catalog));
        retryButton.hidden = false;
      } finally {
        clearTimeout(loadTimeout);
        loading = false;
      }
    }

    function selectTab(index, focus = false) {
      tabs.forEach((tab, tabIndex) => {
        const selected = index === tabIndex;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
        panels[tabIndex].hidden = !selected;
      });
      if (focus) {
        tabs[index].focus();
      }
      if (index === 1) {
        if (activeRun) {
          stopRun(activeRun);
          renderMessage("Search cancelled when switching to Your Recipe. No result was produced.");
        }
        return prepareRecipe();
      }
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => selectTab(index));
      tab.addEventListener("keydown", (event) => {
        let next;
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          next = 1 - index;
        } else if (event.key === "Home") {
          next = 0;
        } else if (event.key === "End") {
          next = 1;
        } else {
          return;
        }
        event.preventDefault();
        selectTab(next, true);
      });
    });
    recipeForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!catalog) {
        return;
      }
      recipe.push(ingredient.value);
      renderSteps();
      renderRecipe();
    });
    product.addEventListener("change", renderRecipe);
    clearButton.addEventListener("click", function () {
      recipe.length = 0;
      renderSteps();
      renderRecipe();
      ingredient.focus();
    });
    retryButton.addEventListener("click", prepareRecipe);
    window.addEventListener("pagehide", function () {
      loadController?.abort();
    });
  }

  initializeRecipeTab();

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
