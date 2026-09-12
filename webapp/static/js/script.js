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

  function appendTextElement(parent, tagName, text, className) {
    const element = document.createElement(tagName);
    element.textContent = text;
    if (className) {
      element.className = className;
    }
    parent.appendChild(element);
    return element;
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

  function catalogItem(catalog, collectionName, identifier) {
    const collection = catalog?.[collectionName];
    return Array.isArray(collection)
      ? collection.find(
          (entry) => entry !== null && typeof entry === "object" && entry.name === identifier,
        )
      : undefined;
  }

  function displayName(catalog, collectionName, identifier) {
    const item = catalogItem(catalog, collectionName, identifier);
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

  function appendChipRow(card, label, names, ordered = false, colors = []) {
    const row = document.createElement("div");
    row.className = "chips-row";
    appendTextElement(row, "span", label, "chips-label");
    if (names.length === 0) {
      appendTextElement(row, "span", "None", "chips__empty");
    } else {
      const list = document.createElement(ordered ? "ol" : "ul");
      list.className = ordered ? "chips chips--ordered" : "chips";
      for (const [index, name] of names.entries()) {
        const chip = appendTextElement(list, "li", name);
        const color = colors[index];
        if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) {
          chip.className = "effect-chip";
          chip.setAttribute("style", `--effect-color: ${color}`);
        }
      }
      row.appendChild(list);
    }
    card.appendChild(row);
  }

  function appendStat(stats, label, value, primary = false) {
    const entry = document.createElement("div");
    entry.className = primary ? "stat stat--primary" : "stat";
    appendTextElement(entry, "dt", label);
    appendTextElement(entry, "dd", value);
    stats.appendChild(entry);
  }

  function appendEffectGuide(card, effectNames, catalog) {
    const described = effectNames
      .map((name) => ({ effect: catalogItem(catalog, "effects", name), name }))
      .filter(({ effect }) => typeof effect?.description === "string" && effect.description);
    if (!described.length) return;
    const guide = document.createElement("details");
    guide.className = "effect-guide";
    appendTextElement(guide, "summary", "What these effects do");
    const list = document.createElement("dl");
    list.className = "effect-guide__list";
    for (const { effect, name } of described) {
      const term = document.createElement("dt");
      const swatch = document.createElement("span");
      swatch.className = "effect-swatch";
      swatch.setAttribute("aria-hidden", "true");
      if (typeof effect.color === "string" && /^#[0-9a-f]{6}$/i.test(effect.color)) {
        swatch.setAttribute("style", `--effect-color: ${effect.color}`);
      }
      term.appendChild(swatch);
      appendTextElement(term, "span", displayName(catalog, "effects", name));
      list.appendChild(term);
      appendTextElement(list, "dd", effect.description);
    }
    guide.appendChild(list);
    card.appendChild(guide);
  }

  function renderCombination(title, combination, catalog, destination = resultDiv, status = null) {
    const card = document.createElement("article");
    card.className = "card result-card";
    const head = document.createElement("header");
    head.className = "result-card__head";
    appendTextElement(head, "h2", title);
    if (status) {
      appendTextElement(head, "span", status.label, `badge badge--${status.tone}`);
    }
    card.appendChild(head);
    const stats = document.createElement("dl");
    stats.className = "stats";
    appendStat(
      stats,
      "Profit",
      `${(combination.sell_price - combination.substance_cost).toFixed(2)}$`,
      true,
    );
    appendStat(stats, "Sell Price", `${combination.sell_price.toFixed(2)}$`);
    appendStat(stats, "Ingredient Cost", `${combination.substance_cost.toFixed(2)}$`);
    appendStat(stats, "Modifier", combination.modifier.toFixed(2));
    card.appendChild(stats);
    appendChipRow(
      card,
      "Ingredients",
      combination.substances.map((name) => displayName(catalog, "substances", name)),
      true,
    );
    appendChipRow(
      card,
      "Effects",
      combination.effects.map((name) => displayName(catalog, "effects", name)),
      false,
      combination.effects.map((name) => catalogItem(catalog, "effects", name)?.color),
    );
    appendEffectGuide(card, combination.effects, catalog);
    destination.appendChild(card);
  }

  function renderMessage(message, { error = false, busy = false } = {}) {
    const element = document.createElement("div");
    element.setAttribute("role", error ? "alert" : "status");
    if (error) {
      element.className = "alert alert--error";
      element.textContent = message;
    } else if (busy) {
      element.className = "status-block";
      appendTextElement(element, "p", message);
      const track = document.createElement("div");
      track.className = "progress";
      track.setAttribute("aria-hidden", "true");
      track.appendChild(document.createElement("span"));
      element.appendChild(track);
    } else {
      element.className = "status-line";
      element.textContent = message;
    }
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

  function isCombination(combination, allowEmpty = false) {
    return (
      combination &&
      Array.isArray(combination.effects) &&
      combination.effects.every((effect) => typeof effect === "string") &&
      Array.isArray(combination.substances) &&
      (allowEmpty || combination.substances.length > 0) &&
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
    const exact = requestedMode === "exact";
    const status = exact
      ? { tone: "proven", label: "Optimality proven" }
      : { tone: "approximate", label: "Approximate result — optimality not guaranteed" };
    renderCombination(
      exact ? "Best Profit Combination" : "Highest profit found",
      result.best_profit,
      catalog,
      resultDiv,
      status,
    );
    const comparison = document.createElement("details");
    comparison.className = "result-comparison";
    appendTextElement(comparison, "summary", "Compare highest modifier");
    renderCombination(
      exact ? "Best Modifier Combination" : "Highest modifier found",
      result.best_modifier,
      catalog,
      comparison,
      status,
    );
    resultDiv.appendChild(comparison);
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
    let response;
    try {
      response = await fetch(searchDataUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
        signal: run.abortController.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      const detail = error instanceof Error && error.message ? `: ${error.message}` : "";
      throw new Error(`Could not load search data${detail}. Reload the page and try again.`);
    }
    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = response.headers?.get?.("Retry-After");
        const parsedRetryAfter = /^\d+$/.test(retryAfter || "") ? Number(retryAfter) : 0;
        const waitSeconds =
          Number.isSafeInteger(parsedRetryAfter) && parsedRetryAfter > 0
            ? Math.min(parsedRetryAfter, 300)
            : null;
        const wait = waitSeconds
          ? ` Wait ${waitSeconds} ${waitSeconds === 1 ? "second" : "seconds"}, then try again.`
          : " Wait before trying again.";
        throw new Error(`Search data is temporarily limited (HTTP 429).${wait}`);
      }
      throw new Error(
        `Could not load search data (HTTP ${response.status}). Reload the page and try again.`,
      );
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
        renderMessage(progressText(message.progress), { busy: true });
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

    const selectedMode = form.querySelector('input[name="search_mode"]:checked');
    if (!selectedMode) return;
    const mode = selectedMode.value;
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
    renderMessage("Loading search data for local computation…", { busy: true });
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
      return null;
    }
    const product = document.getElementById("recipe-product");
    const shelf = document.getElementById("ingredient-shelf");
    const clearButton = document.getElementById("clear-recipe");
    const restoreButton = document.getElementById("restore-recipe");
    const retryButton = document.getElementById("retry-recipe");
    const steps = document.getElementById("recipe-steps");
    const count = document.getElementById("recipe-count");
    const empty = document.getElementById("recipe-empty");
    const dropArea = document.getElementById("recipe-drop-area");
    const announcement = document.getElementById("recipe-announcement");
    const output = document.getElementById("recipe-result");
    const recipe = [];
    let clearedRecipe = null;
    let catalog = null;
    let loading = false;
    let loadController = null;
    let focusedIndex = null;
    let drag = null;
    let pendingTouch = null;
    let suppressTileClick = null;

    function announce(message) {
      if (announcement) announcement.textContent = message;
    }

    function forgetClearedRecipe() {
      clearedRecipe = null;
      if (restoreButton) restoreButton.hidden = true;
    }

    function substanceDetails(name) {
      const substance = catalog.substances.find((candidate) => candidate.name === name);
      return {
        displayName: displayName(catalog, "substances", name),
        price: `${(substance.price_cents / 100).toFixed(2)}$`,
      };
    }

    function recipeError(message) {
      const alert = appendTextElement(output, "p", message, "alert alert--error");
      alert.setAttribute("role", "alert");
    }

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
        recipeError(readableMessage(message, catalog));
      }
    }

    function applyIngredient(name) {
      cancelDrag();
      forgetClearedRecipe();
      const { displayName: ingredientName } = substanceDetails(name);
      recipe.push(name);
      announce(`Added ${ingredientName} as step ${recipe.length}.`);
      renderSteps();
      renderRecipe();
    }

    function renderShelf() {
      shelf.replaceChildren();
      for (const substance of catalog.substances) {
        const tile = document.createElement("button");
        tile.type = "button";
        tile.className = "recipe-ingredient-tile";
        tile.dataset.ingredient = substance.name;
        const name = displayName(catalog, "substances", substance.name);
        const price = `${(substance.price_cents / 100).toFixed(2)}$`;
        tile.setAttribute("aria-label", `Add ${name}, ${price}`);
        appendTextElement(tile, "span", name, "recipe-ingredient-tile__name");
        appendTextElement(tile, "span", price, "recipe-ingredient-tile__price");
        tile.addEventListener("click", function (event) {
          if (event?.detail === 0) {
            applyIngredient(substance.name);
            return;
          }
          if (suppressTileClick?.name === substance.name) {
            suppressTileClick = null;
            return;
          }
          applyIngredient(substance.name);
        });
        tile.addEventListener("pointerdown", (event) => {
          if (event.pointerType === "touch") return;
          suppressTileClick = null;
          startDrag(event, { name: substance.name, source: tile, type: "shelf" });
        });
        addTouchListeners(tile, { name: substance.name, source: tile, type: "shelf" });
        shelf.appendChild(tile);
      }
    }

    function mutateRecipe(message, focusIndex, mutation) {
      cancelDrag();
      forgetClearedRecipe();
      mutation();
      focusedIndex = recipe.length ? Math.min(focusIndex, recipe.length - 1) : null;
      renderSteps(focusedIndex);
      if (!recipe.length) shelf.children[0]?.focus();
      renderRecipe();
      announce(message);
    }

    function renderSteps(focusIndex = null) {
      steps.replaceChildren();
      recipe.forEach((name, index) => {
        const row = document.createElement("li");
        row.className = "recipe-step";
        row.dataset.index = String(index);
        const { displayName: ingredientName } = substanceDetails(name);
        row.tabIndex = 0;
        row.setAttribute("aria-label", `Step ${index + 1}: ${ingredientName}`);
        row.setAttribute("aria-describedby", "recipe-order-hint");
        appendTextElement(row, "span", ingredientName, "recipe-step__name");
        const removeButton = appendTextElement(row, "button", "Delete", "recipe-step__remove");
        removeButton.type = "button";
        removeButton.setAttribute(
          "aria-label",
          `Delete ingredient ${index + 1}: ${ingredientName}`,
        );
        removeButton.addEventListener("click", () => {
          mutateRecipe(`Deleted ${ingredientName} from step ${index + 1}.`, index, () => {
            recipe.splice(index, 1);
          });
        });
        row.addEventListener("focus", () => {
          focusedIndex = index;
        });
        row.addEventListener("keydown", (event) => {
          if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
          const next = index + (event.key === "ArrowUp" ? -1 : 1);
          if (next < 0 || next >= recipe.length) return;
          event.preventDefault();
          mutateRecipe(`Moved ${ingredientName} to step ${next + 1}.`, next, () => {
            [recipe[index], recipe[next]] = [recipe[next], recipe[index]];
          });
        });
        row.addEventListener("pointerdown", (event) => {
          if (event.pointerType === "touch" || event.target === removeButton) return;
          startDrag(event, { fromIndex: index, name, source: row, type: "row" });
        });
        addTouchListeners(row, { fromIndex: index, name, source: row, type: "row" }, removeButton);
        steps.appendChild(row);
      });
      count.textContent = `(${recipe.length} ${recipe.length === 1 ? "ingredient" : "ingredients"})`;
      clearButton.disabled = recipe.length === 0;
      empty.hidden = recipe.length !== 0;
      if (focusIndex !== null) {
        (steps.children[focusIndex] || shelf.children[0])?.focus();
      }
    }

    function clearDropIndicator() {
      for (const row of steps.children) row.classList.remove("recipe-drop-before");
      dropArea.classList.remove("recipe-drop-at-end");
    }

    function updateDropTarget(clientX, clientY) {
      if (!drag?.moved) return;
      clearDropIndicator();
      const bounds = dropArea.getBoundingClientRect();
      const inside =
        clientX >= bounds.left &&
        clientX <= bounds.right &&
        clientY >= bounds.top &&
        clientY <= bounds.bottom;
      drag.dropIndex = null;
      if (!inside) return;
      let dropIndex = recipe.length;
      for (let index = 0; index < steps.children.length; index += 1) {
        const rowBounds = steps.children[index].getBoundingClientRect();
        if (clientY < rowBounds.top + rowBounds.height / 2) {
          dropIndex = index;
          break;
        }
      }
      drag.dropIndex = dropIndex;
      if (dropIndex < steps.children.length) {
        steps.children[dropIndex].classList.add("recipe-drop-before");
      } else {
        dropArea.classList.add("recipe-drop-at-end");
      }
    }

    function autoScroll() {
      if (!drag?.moved) return;
      const edge = 72;
      const distance =
        drag.clientY < edge
          ? -Math.ceil((edge - drag.clientY) / 6)
          : drag.clientY > window.innerHeight - edge
            ? Math.ceil((drag.clientY - (window.innerHeight - edge)) / 6)
            : 0;
      if (distance) {
        window.scrollBy(0, distance);
        updateDropTarget(drag.clientX, drag.clientY);
        drag.animationFrame = window.requestAnimationFrame(autoScroll);
      } else {
        drag.animationFrame = null;
      }
    }

    function moveDrag(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.clientX = event.clientX;
      drag.clientY = event.clientY;
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (!drag.moved && distance < 5) return;
      if (!drag.moved) {
        drag.moved = true;
        drag.source.classList.add("is-drag-source");
        document.body.classList.add("recipe-is-dragging");
        if (!drag.visible) document.body.appendChild(drag.ghost);
        drag.visible = true;
      }
      drag.ghost.style.left = `${event.clientX - drag.grabX}px`;
      drag.ghost.style.top = `${event.clientY - drag.grabY}px`;
      updateDropTarget(event.clientX, event.clientY);
      if (!drag.animationFrame) drag.animationFrame = window.requestAnimationFrame(autoScroll);
      event.preventDefault();
    }

    function finishDrag({ commit = false } = {}) {
      if (!drag) return;
      const finished = drag;
      drag = null;
      if (finished.animationFrame) window.cancelAnimationFrame(finished.animationFrame);
      clearDropIndicator();
      finished.source.classList.remove("is-drag-source");
      document.body.classList.remove("recipe-is-dragging");
      finished.ghost.remove();
      if (finished.input === "pointer") {
        window.removeEventListener("pointermove", moveDrag);
        window.removeEventListener("pointerup", releaseDrag);
        window.removeEventListener("pointercancel", cancelDragEvent);
        finished.captureTarget.removeEventListener("lostpointercapture", cancelDragEvent);
      }
      if (finished.captureTarget?.hasPointerCapture?.(finished.pointerId)) {
        finished.captureTarget.releasePointerCapture(finished.pointerId);
      }
      if (finished.moved && finished.type === "shelf") {
        const suppression = { name: finished.name };
        suppressTileClick = suppression;
        setTimeout(() => {
          if (suppressTileClick === suppression) suppressTileClick = null;
        }, 750);
      }
      if (!commit || !finished.moved || finished.dropIndex === null) return;
      let targetIndex = finished.dropIndex;
      if (finished.type === "row") {
        if (targetIndex > finished.fromIndex) targetIndex -= 1;
        if (targetIndex === finished.fromIndex) {
          announce(
            `${substanceDetails(finished.name).displayName} stayed at step ${targetIndex + 1}.`,
          );
          return;
        }
        recipe.splice(finished.fromIndex, 1);
      }
      forgetClearedRecipe();
      recipe.splice(targetIndex, 0, finished.name);
      focusedIndex = targetIndex;
      renderSteps(targetIndex);
      renderRecipe();
      const ingredientName = substanceDetails(finished.name).displayName;
      announce(
        finished.type === "row"
          ? `Moved ${ingredientName} to step ${targetIndex + 1}.`
          : `Inserted ${ingredientName} as step ${targetIndex + 1}.`,
      );
    }

    function releaseDrag(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      updateDropTarget(event.clientX, event.clientY);
      finishDrag({ commit: true });
    }

    function cancelDragEvent(event) {
      if (drag && event?.pointerId !== undefined && event.pointerId !== drag.pointerId) return;
      finishDrag();
    }

    function cancelDrag() {
      if (pendingTouch) {
        clearTimeout(pendingTouch.timer);
        pendingTouch = null;
      }
      finishDrag();
    }

    function startDrag(event, details) {
      if (drag) {
        if (event.pointerId !== drag.pointerId) cancelDrag();
        return;
      }
      if (event.button !== 0 || event.isPrimary === false || !Number.isFinite(event.pointerId)) {
        return;
      }
      const sourceBounds = details.source.getBoundingClientRect();
      const ghost = details.source.cloneNode(true);
      ghost.classList.remove("is-drag-source");
      ghost.classList.add("recipe-drag-ghost");
      ghost.setAttribute("aria-hidden", "true");
      ghost.inert = true;
      if (details.type === "row") ghost.dataset.stepNumber = String(details.fromIndex + 1);
      ghost.style.position = "fixed";
      ghost.style.width = `${sourceBounds.width}px`;
      ghost.style.height = `${sourceBounds.height}px`;
      ghost.style.left = `${sourceBounds.left}px`;
      ghost.style.top = `${sourceBounds.top}px`;
      drag = {
        ...details,
        animationFrame: null,
        captureTarget: event.currentTarget,
        clientX: event.clientX,
        clientY: event.clientY,
        dropIndex: null,
        ghost,
        grabX: event.clientX - sourceBounds.left,
        grabY: event.clientY - sourceBounds.top,
        input: "pointer",
        moved: false,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        visible: false,
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.currentTarget.addEventListener("lostpointercapture", cancelDragEvent);
      window.addEventListener("pointermove", moveDrag);
      window.addEventListener("pointerup", releaseDrag);
      window.addEventListener("pointercancel", cancelDragEvent);
    }

    function touchByIdentifier(touches, identifier) {
      return Array.from(touches).find((touch) => touch.identifier === identifier);
    }

    function activateTouchDrag() {
      if (!pendingTouch || drag) return;
      const touch = pendingTouch;
      const sourceBounds = touch.details.source.getBoundingClientRect();
      const ghost = touch.details.source.cloneNode(true);
      ghost.classList.add("recipe-drag-ghost");
      ghost.setAttribute("aria-hidden", "true");
      ghost.inert = true;
      if (touch.details.type === "row") {
        ghost.dataset.stepNumber = String(touch.details.fromIndex + 1);
      }
      ghost.style.position = "fixed";
      ghost.style.width = `${sourceBounds.width}px`;
      ghost.style.height = `${sourceBounds.height}px`;
      ghost.style.left = `${sourceBounds.left}px`;
      ghost.style.top = `${sourceBounds.top}px`;
      drag = {
        ...touch.details,
        animationFrame: null,
        captureTarget: null,
        clientX: touch.clientX,
        clientY: touch.clientY,
        dropIndex: null,
        ghost,
        grabX: touch.clientX - sourceBounds.left,
        grabY: touch.clientY - sourceBounds.top,
        input: "touch",
        moved: false,
        pointerId: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        visible: true,
      };
      drag.source.classList.add("is-drag-source");
      document.body.classList.add("recipe-is-dragging");
      document.body.appendChild(ghost);
      pendingTouch = null;
    }

    function addTouchListeners(source, details, ignoredTarget = null) {
      source.addEventListener(
        "touchstart",
        (event) => {
          if (event.target === ignoredTarget) return;
          suppressTileClick = null;
          if (event.touches.length !== 1 || pendingTouch || drag) {
            cancelDrag();
            return;
          }
          const touch = event.touches[0];
          pendingTouch = {
            clientX: touch.clientX,
            clientY: touch.clientY,
            details,
            identifier: touch.identifier,
            startX: touch.clientX,
            startY: touch.clientY,
            timer: setTimeout(activateTouchDrag, 250),
          };
        },
        { passive: true },
      );
      source.addEventListener(
        "touchmove",
        (event) => {
          if (event.touches.length !== 1) {
            cancelDrag();
            return;
          }
          const identifier = drag?.input === "touch" ? drag.pointerId : pendingTouch?.identifier;
          const touch = touchByIdentifier(event.touches, identifier);
          if (!touch) {
            cancelDrag();
            return;
          }
          if (pendingTouch) {
            const distance = Math.hypot(
              touch.clientX - pendingTouch.startX,
              touch.clientY - pendingTouch.startY,
            );
            if (distance > 8) cancelDrag();
            return;
          }
          if (!drag) return;
          event.preventDefault();
          moveDrag({
            clientX: touch.clientX,
            clientY: touch.clientY,
            pointerId: drag.pointerId,
            preventDefault() {},
          });
        },
        { passive: false },
      );
      source.addEventListener("touchend", (event) => {
        if (pendingTouch && touchByIdentifier(event.changedTouches, pendingTouch.identifier)) {
          cancelDrag();
          return;
        }
        if (!drag || drag.input !== "touch") return;
        const touch = touchByIdentifier(event.changedTouches, drag.pointerId);
        if (!touch) return;
        updateDropTarget(touch.clientX, touch.clientY);
        if (drag.moved) event.preventDefault();
        finishDrag({ commit: true });
      });
      source.addEventListener("touchcancel", cancelDrag);
    }

    async function prepareRecipe() {
      if (catalog || loading) {
        return;
      }
      loading = true;
      let loadTimeout = null;
      retryButton.hidden = true;
      output.replaceChildren();
      appendTextElement(output, "p", "Loading recipe data for local computation…", "status-line");
      try {
        if (typeof window.Schedule1Search?.evaluateRecipe !== "function") {
          throw new Error("The recipe calculator could not load. Reload the page to try again.");
        }
        loadController = new AbortController();
        loadTimeout = setTimeout(() => loadController.abort(), 15_000);
        const loaded = await loadCatalog({ abortController: loadController });
        window.Schedule1Search.validateCatalog(loaded, 0);
        catalog = loaded;
        renderShelf();
        product.disabled = false;
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
        recipeError(readableMessage(message, catalog));
        retryButton.hidden = false;
      } finally {
        clearTimeout(loadTimeout);
        loading = false;
      }
    }

    recipeForm.addEventListener("submit", (event) => event.preventDefault());
    product.addEventListener("change", function () {
      forgetClearedRecipe();
      cancelDrag();
      renderRecipe();
    });
    clearButton.addEventListener("click", function () {
      cancelDrag();
      clearedRecipe = { focusedIndex, recipe: [...recipe] };
      recipe.length = 0;
      focusedIndex = null;
      renderSteps();
      renderRecipe();
      if (restoreButton) restoreButton.hidden = clearedRecipe.recipe.length === 0;
      shelf.children[0]?.focus();
      announce("Recipe cleared. Undo clear is available.");
    });
    restoreButton?.addEventListener("click", function () {
      cancelDrag();
      if (!clearedRecipe) return;
      recipe.push(...clearedRecipe.recipe);
      focusedIndex = clearedRecipe.focusedIndex;
      const focusIndex = focusedIndex ?? (recipe.length ? 0 : null);
      forgetClearedRecipe();
      renderSteps(focusIndex);
      renderRecipe();
      announce(`Restored ${recipe.length} recipe steps.`);
    });
    retryButton.addEventListener("click", prepareRecipe);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && (drag || pendingTouch)) {
        event.preventDefault();
        cancelDrag();
        announce("Drag cancelled. Recipe unchanged.");
      }
    });
    window.addEventListener("blur", cancelDrag);
    window.addEventListener("resize", cancelDrag);
    window.addEventListener(
      "touchstart",
      (event) => {
        if ((pendingTouch || drag?.input === "touch") && event.touches.length > 1) cancelDrag();
      },
      { passive: true },
    );
    window.addEventListener("pagehide", function () {
      cancelDrag();
      loadController?.abort();
    });
    return { cancel: cancelDrag, prepare: prepareRecipe };
  }

  function initializeEffectTab() {
    const effectForm = document.getElementById("effect-form");
    if (!effectForm) return null;
    const product = document.getElementById("effect-product");
    const level = document.getElementById("effect-level");
    const maxIngredients = document.getElementById("effect-max-ingredients");
    const filter = document.getElementById("effect-filter");
    const options = document.getElementById("effect-options");
    const selectionCount = document.getElementById("effect-selection-count");
    const selectionSummary = document.getElementById("effect-selection-summary");
    const matchHint = document.getElementById("effect-match-hint");
    const clearButton = document.getElementById("clear-effects");
    const submitButton = document.getElementById("find-effects");
    const cancelButton = document.getElementById("cancel-effects");
    const retryButton = document.getElementById("retry-effects");
    const output = document.getElementById("effect-result");
    let catalog = null;
    let loading = false;
    let loadController = null;
    let activeEffectRun = null;
    let nextEffectRequestId = 1;
    let optionEntries = [];

    function effectMessage(message, { busy = false, error = false } = {}) {
      const element = document.createElement("div");
      element.setAttribute("role", error ? "alert" : "status");
      if (error) {
        element.className = "alert alert--error";
        element.textContent = message;
      } else if (busy) {
        element.className = "status-block";
        appendTextElement(element, "p", message);
        const track = document.createElement("div");
        track.className = "progress";
        track.setAttribute("aria-hidden", "true");
        track.appendChild(document.createElement("span"));
        element.appendChild(track);
      } else {
        element.className = "status-line";
        element.textContent = message;
      }
      output.replaceChildren(element);
    }

    function selectedEffects(preference) {
      return optionEntries
        .filter((entry) => entry.inputs[preference].checked)
        .map(({ effect }) => effect.name);
    }

    function selectedMatchMode() {
      return effectForm.querySelector('input[name="effect_match_mode"]:checked')?.value;
    }

    function canSearchEffects() {
      const wanted = selectedEffects("wanted");
      const excluded = selectedEffects("excluded");
      return wanted.length > 0 || (selectedMatchMode() === "contains" && excluded.length > 0);
    }

    function setEffectBusy(busy) {
      submitButton.disabled = busy || !canSearchEffects() || !catalog;
      cancelButton.hidden = !busy;
      effectForm.setAttribute("aria-busy", String(busy));
    }

    function updateSelection() {
      const wanted = selectedEffects("wanted");
      const excluded = selectedEffects("excluded");
      selectionCount.textContent = `${wanted.length} wanted · ${excluded.length} avoided`;
      selectionSummary.replaceChildren();
      for (const preference of ["wanted", "excluded"]) {
        for (const name of selectedEffects(preference)) {
          const entry = optionEntries.find(({ effect }) => effect.name === name);
          const display = displayName(catalog, "effects", name);
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "effect-selection-chip";
          chip.dataset.preference = preference;
          appendTextElement(
            chip,
            "span",
            `${preference === "wanted" ? "Want" : "Avoid"}: ${display}`,
          );
          const removeMark = appendTextElement(chip, "span", "×");
          removeMark.setAttribute("aria-hidden", "true");
          chip.setAttribute(
            "aria-label",
            `Remove ${display} from ${preference === "wanted" ? "wanted" : "avoided"} effects`,
          );
          chip.addEventListener("click", () => {
            discardEffectResult();
            setPreference(entry, "neutral");
            updateSelection();
            (entry.fieldset.hidden ? filter : entry.inputs.neutral).focus();
          });
          selectionSummary.appendChild(chip);
        }
      }
      clearButton.disabled = wanted.length === 0 && excluded.length === 0;
      if (!activeEffectRun) setEffectBusy(false);
    }

    function updateMatchHint() {
      if (!matchHint) return;
      matchHint.textContent =
        selectedMatchMode() === "contains"
          ? "Wanted effects must be present; avoided effects must be absent. Other effects are allowed."
          : "Only wanted effects. All other effects are excluded.";
    }

    function syncPreference(entry) {
      const preference = Object.entries(entry.inputs).find(([, input]) => input.checked)?.[0];
      entry.fieldset.dataset.preference = preference || "neutral";
    }

    function setPreference(entry, preference) {
      for (const [value, input] of Object.entries(entry.inputs)) {
        input.checked = value === preference;
      }
      syncPreference(entry);
    }

    function discardEffectResult() {
      const wasRunning = Boolean(activeEffectRun);
      if (activeEffectRun) stopEffectRun(activeEffectRun);
      output.replaceChildren();
      if (wasRunning) {
        effectMessage("Effect search cancelled because its settings changed.", { error: true });
      }
    }

    function filterOptions() {
      const query = filter.value.trim().toLocaleLowerCase();
      let matches = 0;
      for (const entry of optionEntries) {
        const searchable =
          `${entry.displayName} ${entry.effect.description || ""}`.toLocaleLowerCase();
        entry.fieldset.hidden = Boolean(query) && !searchable.includes(query);
        if (!entry.fieldset.hidden) matches += 1;
      }
      const empty = options.children[options.children.length - 1];
      if (empty?.className === "effect-options-empty") empty.hidden = matches !== 0;
    }

    function renderEffectOptions() {
      options.replaceChildren();
      optionEntries = [];
      for (const effect of catalog.effects) {
        const fieldset = document.createElement("fieldset");
        fieldset.className = "effect-option";
        fieldset.dataset.preference = "neutral";
        const description =
          typeof effect.description === "string" && effect.description ? effect.description : "";
        const descriptionId = `effect-description-${effect.name}`;
        fieldset.setAttribute("aria-describedby", descriptionId);
        const heading = document.createElement("legend");
        heading.className = "effect-option__heading";
        const swatch = document.createElement("span");
        swatch.className = "effect-swatch";
        swatch.setAttribute("aria-hidden", "true");
        if (typeof effect.color === "string" && /^#[0-9a-f]{6}$/i.test(effect.color)) {
          swatch.setAttribute("style", `--effect-color: ${effect.color}`);
        }
        heading.appendChild(swatch);
        const display = displayName(catalog, "effects", effect.name);
        appendTextElement(heading, "span", display, "effect-option__name");
        fieldset.appendChild(heading);
        const descriptionElement = appendTextElement(
          fieldset,
          "p",
          description,
          "effect-option__description",
        );
        descriptionElement.id = descriptionId;
        const preference = document.createElement("div");
        preference.className = "effect-preference";
        const inputs = {};
        const entry = { displayName: display, effect, fieldset, inputs };
        for (const [value, labelText] of [
          ["wanted", "Want"],
          ["neutral", "Neutral"],
          ["excluded", "Avoid"],
        ]) {
          const label = document.createElement("label");
          label.className = "effect-preference__option";
          const input = document.createElement("input");
          input.type = "radio";
          input.name = `effect_preference_${effect.name}`;
          input.value = value;
          input.checked = value === "neutral";
          input.addEventListener("change", () => {
            if (!input.checked) return;
            discardEffectResult();
            syncPreference(entry);
            updateSelection();
          });
          label.appendChild(input);
          appendTextElement(label, "span", labelText);
          preference.appendChild(label);
          inputs[value] = input;
        }
        fieldset.appendChild(preference);
        options.appendChild(fieldset);
        optionEntries.push(entry);
      }
      const noMatches = appendTextElement(
        options,
        "p",
        "No effects match this filter.",
        "effect-options-empty",
      );
      noMatches.hidden = true;
      updateSelection();
      filterOptions();
    }

    function sameUniqueStrings(values, expected) {
      return (
        Array.isArray(values) &&
        values.length === expected.length &&
        values.every((value) => typeof value === "string") &&
        new Set(values).size === values.length &&
        values.every((value) => expected.includes(value))
      );
    }

    function validateEffectResult(result, run) {
      const search = result?.search;
      const exact = run.mode === "exact";
      const foundStatus = exact ? "optimal" : "approximate";
      const validSearch =
        search?.mode === run.mode &&
        search.optimality_proven === exact &&
        (search.status === foundStatus || search.status === "not_found");
      if (
        result?.error ||
        !validSearch ||
        result.match_mode !== run.matchMode ||
        !sameUniqueStrings(result.target_effects, run.targetEffects) ||
        !sameUniqueStrings(result.excluded_effects, run.excludedEffects)
      ) {
        return null;
      }
      if (search.status === "not_found") {
        return result.recipe === null ? { notFound: true, recipe: null } : null;
      }
      if (!isCombination(result.recipe, true)) return null;
      if (
        result.recipe.substances.length > run.request.combination_size ||
        (run.matchMode === "exact"
          ? !sameUniqueStrings(result.recipe.effects, run.targetEffects)
          : !run.targetEffects.every((effect) => result.recipe.effects.includes(effect)) ||
            run.excludedEffects.some((effect) => result.recipe.effects.includes(effect)))
      ) {
        return null;
      }
      const maxLevel = catalog.levels?.[run.request.level];
      if (
        !Number.isInteger(maxLevel) ||
        result.recipe.substances.some((name) => {
          const substance = catalogItem(catalog, "substances", name);
          return !substance || !Number.isInteger(substance.level) || substance.level > maxLevel;
        })
      ) {
        return null;
      }
      try {
        const evaluated = window.Schedule1Search.evaluateRecipe(catalog, {
          product_name: run.request.product_name,
          substances: result.recipe.substances,
        });
        if (
          run.matchMode === "exact"
            ? !sameUniqueStrings(evaluated.effects, run.targetEffects)
            : !run.targetEffects.every((effect) => evaluated.effects.includes(effect)) ||
              run.excludedEffects.some((effect) => evaluated.effects.includes(effect))
        ) {
          return null;
        }
        return { notFound: false, recipe: evaluated };
      } catch {
        return null;
      }
    }

    function stopEffectRun(run) {
      clearTimeout(run.watchdog);
      run.abortController.abort();
      if (run.worker) {
        run.worker.terminate();
        run.worker = null;
      }
      if (activeEffectRun === run) {
        activeEffectRun = null;
        setEffectBusy(false);
      }
    }

    function failEffectRun(run, message) {
      if (activeEffectRun !== run) return;
      stopEffectRun(run);
      effectMessage(`${readableMessage(message, catalog)} No result was produced.`, {
        error: true,
      });
    }

    function renderEffectResult(result, run) {
      output.replaceChildren();
      if (result.notFound) {
        const proven = run.mode === "exact";
        effectMessage(
          run.matchMode === "contains"
            ? proven
              ? "No recipe satisfies the wanted and avoided effects within the selected base, rank, and ingredient limit. This is proven for these settings."
              : "The fast search found no recipe satisfying the wanted and avoided effects. This does not prove that no match exists."
            : proven
              ? "No recipe has only the wanted effects within the selected base, rank, and ingredient limit. This is proven for these settings."
              : "The fast search found no recipe with only the wanted effects. This does not prove that no match exists.",
        );
        return;
      }
      renderCombination(
        run.matchMode === "contains"
          ? run.mode === "exact"
            ? "Shortest matching recipe"
            : "Matching recipe found"
          : run.mode === "exact"
            ? "Shortest recipe with only wanted effects"
            : "Recipe with only wanted effects found",
        result.recipe,
        catalog,
        output,
        run.mode === "exact"
          ? { label: "Optimality proven", tone: "proven" }
          : { label: "Approximate search — optimality not guaranteed", tone: "approximate" },
      );
    }

    function startEffectWorker(run) {
      if (activeEffectRun !== run) return;
      const worker = new Worker(workerUrl);
      run.worker = worker;
      worker.addEventListener("message", (event) => {
        const message = event.data;
        if (activeEffectRun !== run || message?.request_id !== run.requestId) return;
        if (message.type === "progress") {
          effectMessage(progressText(message.progress), { busy: true });
          return;
        }
        if (message.type === "result") {
          const validated = validateEffectResult(message.result, run);
          if (!validated) {
            failEffectRun(
              run,
              "The local effect search returned an invalid or incomplete response.",
            );
            return;
          }
          stopEffectRun(run);
          renderEffectResult(validated, run);
          return;
        }
        if (message.type === "error") {
          const metadata = message.search;
          const validError =
            metadata?.mode === run.mode &&
            (metadata.status === "incomplete" || metadata.status === "error") &&
            metadata.optimality_proven === false;
          failEffectRun(
            run,
            validError && typeof message.error === "string"
              ? message.error
              : "The local effect search failed with an invalid response.",
          );
          return;
        }
        failEffectRun(run, "The local effect search returned an unknown response.");
      });
      worker.addEventListener("error", (event) => {
        event.preventDefault();
        failEffectRun(run, "The local effect search could not run in this browser.");
      });
      worker.addEventListener("messageerror", () => {
        failEffectRun(run, "The browser could not read the local effect search response.");
      });
      worker.postMessage({
        catalog,
        request: run.request,
        request_id: run.requestId,
        type: "search_effects",
      });
    }

    async function prepareEffects() {
      if (catalog || loading) return;
      loading = true;
      retryButton.hidden = true;
      effectMessage("Loading effect data for local search…");
      let loadTimeout = null;
      try {
        if (
          typeof Worker !== "function" ||
          typeof AbortController !== "function" ||
          typeof window.Schedule1Search?.evaluateRecipe !== "function"
        ) {
          throw new Error("This browser cannot run the effect search locally.");
        }
        loadController = new AbortController();
        loadTimeout = setTimeout(() => loadController.abort(), 15_000);
        const loaded = await loadCatalog({ abortController: loadController });
        window.Schedule1Search.validateCatalog(loaded, 0);
        catalog = loaded;
        renderEffectOptions();
        updateMatchHint();
        product.disabled = false;
        level.disabled = false;
        maxIngredients.disabled = false;
        filter.disabled = false;
        clearButton.disabled = true;
        effectMessage("Choose the effects you want or want to avoid.");
      } catch (error) {
        catalogCache = null;
        effectMessage(
          error?.name === "AbortError"
            ? "Loading effect data was interrupted. Please try again."
            : error instanceof Error
              ? error.message
              : "Could not load effect data.",
          { error: true },
        );
        retryButton.hidden = false;
      } finally {
        clearTimeout(loadTimeout);
        loading = false;
      }
    }

    effectForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (activeEffectRun || !catalog) return;
      const targetEffects = selectedEffects("wanted");
      const excludedEffects = selectedEffects("excluded");
      const selectedMode = effectForm.querySelector(
        'input[name="effect_search_mode"]:checked, input[name="search_mode"]:checked',
      );
      const matchMode = selectedMatchMode();
      if (
        (!targetEffects.length && !(matchMode === "contains" && excludedEffects.length)) ||
        !selectedMode
      )
        return;
      const request = {
        combination_size: Number(maxIngredients.value),
        excluded_effects: [...excludedEffects],
        level: level.value,
        match_mode: matchMode,
        product_name: product.value,
        search_mode: selectedMode.value,
        target_effects: [...targetEffects],
      };
      const run = {
        abortController: new AbortController(),
        excludedEffects: [...excludedEffects],
        matchMode,
        mode: selectedMode.value,
        request,
        requestId: nextEffectRequestId,
        targetEffects: [...targetEffects],
        watchdog: null,
        worker: null,
      };
      nextEffectRequestId += 1;
      activeEffectRun = run;
      setEffectBusy(true);
      effectMessage("Starting local effect search…", { busy: true });
      run.watchdog = setTimeout(
        () => failEffectRun(run, "The local effect search timed out."),
        run.mode === "exact" ? 305_000 : 20_000,
      );
      try {
        startEffectWorker(run);
      } catch (error) {
        failEffectRun(
          run,
          error instanceof Error
            ? `The local effect search could not start: ${error.message}`
            : "The local effect search could not start in this browser.",
        );
      }
    });
    filter.addEventListener("input", filterOptions);
    clearButton.addEventListener("click", () => {
      discardEffectResult();
      for (const entry of optionEntries) setPreference(entry, "neutral");
      updateSelection();
      const firstVisible = optionEntries.find(({ fieldset }) => !fieldset.hidden);
      (firstVisible?.inputs.neutral || filter).focus();
    });
    product.addEventListener("change", discardEffectResult);
    level.addEventListener("change", discardEffectResult);
    maxIngredients.addEventListener("input", discardEffectResult);
    effectForm.addEventListener("change", (event) => {
      if (event.target?.name === "effect_search_mode") discardEffectResult();
      if (event.target?.name === "effect_match_mode") {
        discardEffectResult();
        updateMatchHint();
        updateSelection();
      }
    });
    cancelButton.addEventListener("click", () => {
      if (!activeEffectRun) return;
      const run = activeEffectRun;
      stopEffectRun(run);
      effectMessage("Effect search cancelled. Your selected effects were kept.", { error: true });
    });
    retryButton.addEventListener("click", prepareEffects);
    window.addEventListener("pagehide", () => {
      loadController?.abort();
      if (activeEffectRun) stopEffectRun(activeEffectRun);
    });
    return {
      cancelSearch(message) {
        if (!activeEffectRun) return;
        const run = activeEffectRun;
        stopEffectRun(run);
        effectMessage(message, { error: true });
      },
      prepare: prepareEffects,
    };
  }

  function initializeTabs(recipeController, effectController) {
    const tabs = ["search-tab", "recipe-tab", "effect-tab"].map((id) =>
      document.getElementById(id),
    );
    const panels = ["search-panel", "recipe-panel", "effect-panel"].map((id) =>
      document.getElementById(id),
    );
    if (tabs.some((tab) => !tab) || panels.some((panel) => !panel)) return;

    function selectTab(index, focus = false) {
      recipeController?.cancel();
      if (index !== 0 && activeRun) {
        stopRun(activeRun);
        renderMessage("Search cancelled when switching tabs. No result was produced.");
      }
      if (index !== 2) {
        effectController?.cancelSearch(
          "Effect search cancelled when switching tabs. Your selected effects were kept.",
        );
      }
      tabs.forEach((tab, tabIndex) => {
        const selected = index === tabIndex;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
        panels[tabIndex].hidden = !selected;
      });
      if (focus) tabs[index].focus();
      if (index === 1) return recipeController?.prepare();
      if (index === 2) return effectController?.prepare();
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => selectTab(index));
      tab.addEventListener("keydown", (event) => {
        let next;
        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
        else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = tabs.length - 1;
        else return;
        event.preventDefault();
        selectTab(next, true);
      });
    });
  }

  const recipeController = initializeRecipeTab();
  const effectController = initializeEffectTab();
  initializeTabs(recipeController, effectController);

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
