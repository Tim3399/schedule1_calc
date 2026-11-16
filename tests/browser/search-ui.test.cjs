"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const scriptSource = fs.readFileSync(
  path.resolve(__dirname, "../../webapp/static/js/script.js"),
  "utf8",
);

// Records every inline style write (property assignment, setProperty, removeProperty), so a test
// can show that styling stays in styles.css.
function inlineStyle() {
  const writes = [];
  const target = {
    writes,
    setProperty: (name) => writes.push(name),
    removeProperty: (name) => writes.push(name),
  };
  return new Proxy(target, {
    set(object, name, value) {
      writes.push(String(name));
      object[name] = value;
      return true;
    },
  });
}

function element(properties = {}) {
  const node = {
    children: [],
    attributes: {},
    listeners: {},
    style: inlineStyle(),
    ...properties,
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
    },
    classList: {
      add(...names) {
        const classes = new Set((node.className ?? "").split(/\s+/).filter(Boolean));
        for (const name of names) classes.add(name);
        node.className = [...classes].join(" ");
      },
      contains: (name) => (node.className ?? "").split(/\s+/).includes(name),
      remove(...names) {
        node.className = (node.className ?? "")
          .split(/\s+/)
          .filter((name) => name && !names.includes(name))
          .join(" ");
      },
    },
    remove() {
      if (!this.parentNode) return;
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      this.parentNode = null;
    },
    replaceChildren(...children) {
      this.children = children;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
  return node;
}

function successfulResult(mode = "exact") {
  const combination = {
    effects: ["energizing"],
    substances: ["cuke"],
    modifier: 0.22,
    sell_price: 42.7,
    substance_cost: 2,
  };
  return {
    search: {
      mode: mode,
      status: mode === "exact" ? "optimal" : "approximate",
      optimality_proven: mode === "exact",
    },
    best_modifier: combination,
    best_profit: combination,
    stats: {},
  };
}

function loadUi(catalog = {}, mode = "exact", windowProperties = {}) {
  const domReady = [];
  const fetchCalls = [];
  const workers = [];
  let nextTimer = 1;
  const timers = [];
  const submitButton = element({ disabled: true });
  const cancelButton = element({ hidden: true });
  const result = element();
  const modeInputs = {
    exact: element({ checked: mode === "exact", value: "exact" }),
    fast: element({ checked: mode === "fast", value: "fast" }),
  };
  const form = element({
    dataset: { searchDataUrl: "/search-data", workerUrl: "/static/js/search-worker.js" },
    querySelector(selector) {
      return selector === 'button[type="submit"]'
        ? submitButton
        : Object.values(modeInputs).find((input) => input.checked);
    },
  });
  const elements = {
    "best-mix-form": form,
    result: result,
    "cancel-search": cancelButton,
    level: element({ value: "street_rat_i" }),
    "combination-size": element({ value: "2" }),
    "product-name": element({ value: "og_kush" }),
    "search-mode": element(),
    "search-mode-exact": modeInputs.exact,
    "search-mode-fast": modeInputs.fast,
    "search-mode-hint": element({
      textContent:
        "Exact proves the best mix when complete (up to 5 min). Fast gives a quick estimate. If stopped, the best result found is kept without a guarantee.",
    }),
  };

  class FakeWorker {
    constructor(url) {
      this.url = url;
      this.listeners = {};
      this.sent = [];
      this.terminateCalls = 0;
      workers.push(this);
    }

    addEventListener(type, listener) {
      this.listeners[type] = listener;
    }

    postMessage(message) {
      this.sent.push(message);
    }

    terminate() {
      this.terminateCalls += 1;
    }

    emit(data) {
      this.listeners.message({ data: data });
    }
  }

  const context = {
    AbortController,
    Worker: FakeWorker,
    document: {
      addEventListener(type, listener) {
        if (type === "DOMContentLoaded") domReady.push(listener);
      },
      createElement: (tagName) => element({ tagName: tagName, textContent: "" }),
      getElementById: (id) => elements[id],
    },
    fetch: async (url, options) => {
      fetchCalls.push({ url: url, options: options });
      return { ok: true, json: async () => catalog };
    },
    setTimeout(callback, delay) {
      const timer = nextTimer;
      nextTimer += 1;
      timers.push({ callback: callback, delay: delay });
      return timer;
    },
    clearTimeout() {},
    window: element(windowProperties),
  };
  vm.runInNewContext(scriptSource, context, { filename: "script.js" });
  assert.equal(domReady.length, 1);
  domReady[0]();

  return {
    cancelButton,
    fetchCalls,
    form,
    modeHint: elements["search-mode-hint"],
    modeInputs,
    result,
    submitButton,
    timers,
    workers,
  };
}

function descendants(node) {
  return node.children.flatMap((child) => [child, ...descendants(child)]);
}

function submitEvent() {
  return { preventDefault() {} };
}

function selectMode(ui, mode) {
  ui.modeInputs.exact.checked = mode === "exact";
  ui.modeInputs.fast.checked = mode === "fast";
}

function checkpointResult(mode = "exact", profit = 40.7) {
  const result = successfulResult(mode);
  result.search.status = "incomplete";
  result.search.optimality_proven = false;
  result.best_profit = { ...result.best_profit, sell_price: profit + 2 };
  return result;
}

test("cancel retains the latest checkpoint without claiming optimality in either mode", async () => {
  for (const mode of ["exact", "fast"]) {
    const ui = loadUi({}, mode);
    await ui.form.listeners.submit(submitEvent());
    const worker = ui.workers[0];
    const request_id = worker.sent[0].request_id;
    worker.emit({ type: "checkpoint", request_id, result: checkpointResult(mode, 50) });
    worker.emit({ type: "checkpoint", request_id, result: checkpointResult(mode, 60) });
    worker.emit({ type: "progress", request_id, progress: { depth: 2 } });
    assert.equal(ui.submitButton.disabled, true);
    ui.cancelButton.listeners.click();
    assert.equal(worker.terminateCalls, 1);
    assert.match(resultText(ui), /Search cancelled.*Showing the best result found so far/);
    assert.match(resultText(ui), /Highest profit found/);
    assert.match(resultText(ui), /\$60\.00/);
    assert.match(resultText(ui), /Search stopped — optimality not proven/);
    assert.doesNotMatch(resultText(ui), /Optimality proven|Best Profit Combination|No result/);
    const badges = descendants(ui.result).filter((node) =>
      String(node.className).startsWith("badge"),
    );
    assert.equal(badges.length, 2, "profit card and comparison card");
    for (const badge of badges) {
      assert.equal(badge.className, "badge badge--stopped");
      assert.equal(badge.textContent, "Search stopped — optimality not proven");
    }
    const stoppedText = resultText(ui);
    worker.emit({ type: "result", request_id, result: successfulResult(mode) });
    assert.equal(resultText(ui), stoppedText);

    await ui.form.listeners.submit(submitEvent());
    worker.emit({ type: "checkpoint", request_id, result: checkpointResult(mode, 100) });
    ui.cancelButton.listeners.click();
    assert.doesNotMatch(resultText(ui), /Highest profit|60\.00|100\.00/);
    assert.match(resultText(ui), /No recipe was found before the search stopped/);
  }
});

test("limits use the final incumbent and the watchdog retains the latest checkpoint", async () => {
  for (const watchdog of [false, true]) {
    const ui = loadUi();
    await ui.form.listeners.submit(submitEvent());
    const worker = ui.workers[0];
    const request_id = worker.sent[0].request_id;
    worker.emit({ type: "checkpoint", request_id, result: checkpointResult("exact", 50) });
    if (watchdog) {
      ui.timers.find(({ delay }) => delay === 305_000).callback();
    } else {
      worker.emit({
        type: "error",
        request_id,
        error: "Search reached its work limit.",
        search: { mode: "exact", status: "incomplete", optimality_proven: false },
        result: checkpointResult("exact", 70),
      });
    }
    assert.match(resultText(ui), watchdog ? /timed out/ : /work limit/);
    assert.match(resultText(ui), watchdog ? /\$50\.00/ : /\$70\.00/);
    assert.doesNotMatch(resultText(ui), /Optimality proven/);
    assert.equal(ui.submitButton.disabled, false);
  }
});

test("invalid checkpoint metadata and ordinary worker errors never present partial success", async () => {
  for (const kind of ["wrong mode", "proven", "error"]) {
    const ui = loadUi();
    await ui.form.listeners.submit(submitEvent());
    const worker = ui.workers[0];
    const request_id = worker.sent[0].request_id;
    worker.emit({ type: "checkpoint", request_id, result: checkpointResult() });
    const result = checkpointResult();
    if (kind === "wrong mode") result.search.mode = "fast";
    if (kind === "proven") result.search.optimality_proven = true;
    worker.emit(
      kind === "error"
        ? {
            type: "error",
            request_id,
            error: "Engine failed.",
            search: { mode: "exact", status: "error", optimality_proven: false },
          }
        : { type: "checkpoint", request_id, result },
    );
    assert.match(resultText(ui), /No result was produced/);
    assert.doesNotMatch(resultText(ui), /Highest profit found/);
    assert.equal(worker.terminateCalls, 1);
  }
});

function textOf(node) {
  return [node.textContent, ...node.children.map(textOf)].filter(Boolean).join("\n");
}

function resultText(ui) {
  return ui.result.children.map(textOf).join("\n");
}

test("cancel terminates work, ignores stale results, and allows a cached restart", async () => {
  const ui = loadUi();
  assert.equal(ui.submitButton.disabled, false);

  const first = ui.form.listeners.submit(submitEvent());
  const duplicate = ui.form.listeners.submit(submitEvent());
  await Promise.all([first, duplicate]);

  assert.equal(ui.fetchCalls.length, 1);
  assert.equal(ui.fetchCalls[0].url, "/search-data");
  assert.equal(ui.fetchCalls[0].options.method, "GET");
  assert.equal(ui.fetchCalls[0].options.cache, undefined);
  assert.equal(ui.workers.length, 1);
  assert.equal(ui.workers[0].url, "/static/js/search-worker.js");
  assert.equal(ui.submitButton.disabled, true);

  ui.cancelButton.listeners.click();
  assert.equal(ui.workers[0].terminateCalls, 1);
  assert.match(resultText(ui), /Search cancelled/);
  assert.equal(ui.submitButton.disabled, false);

  await ui.form.listeners.submit(submitEvent());
  assert.equal(ui.fetchCalls.length, 1, "successful catalog response should be cached");
  assert.equal(ui.workers.length, 2);

  const oldRequestId = ui.workers[0].sent[0].request_id;
  ui.workers[0].emit({
    type: "result",
    request_id: oldRequestId,
    result: successfulResult(),
  });
  assert.equal(ui.workers[1].terminateCalls, 0, "late result must not end the new run");
  assert.equal(ui.submitButton.disabled, true);

  const newRequestId = ui.workers[1].sent[0].request_id;
  ui.workers[1].emit({
    type: "result",
    request_id: newRequestId,
    result: successfulResult(),
  });
  assert.equal(ui.workers[1].terminateCalls, 1);
  assert.match(resultText(ui), /Best Profit Combination/);
  assert.equal(ui.submitButton.disabled, false);
  assert.equal(
    ui.fetchCalls.some((call) => call.options.method !== "GET"),
    false,
    "UI must not submit server-side calculation requests",
  );
});

test("a result carrying an error never renders otherwise valid winners", async () => {
  const ui = loadUi();
  await ui.form.listeners.submit(submitEvent());
  const worker = ui.workers[0];
  const result = successfulResult();
  result.error = "incomplete";

  worker.emit({ type: "result", request_id: worker.sent[0].request_id, result: result });

  assert.match(resultText(ui), /invalid or incomplete response/);
  assert.doesNotMatch(resultText(ui), /Best Profit Combination/);
  assert.equal(worker.terminateCalls, 1);
});

test("result IDs render with catalog display names and readable unknown fallbacks", async () => {
  const ui = loadUi({
    effects: [{ name: "energizing", display_name: "Energizing" }],
    substances: [{ name: "cuke", display_name: "Cuke" }],
  });
  await ui.form.listeners.submit(submitEvent());
  const worker = ui.workers[0];
  const result = successfulResult();
  result.best_profit = {
    ...result.best_profit,
    effects: ["bright_eyed"],
    substances: ["motor_oil", "constructor"],
  };

  worker.emit({ type: "result", request_id: worker.sent[0].request_id, result: result });

  assert.match(resultText(ui), /Effects · 1\nEnergizing/);
  assert.match(resultText(ui), /Mix\nBase\nOG Kush\n1\nCuke/);
  assert.match(resultText(ui), /Effects · 1\nBright Eyed/);
  assert.match(resultText(ui), /Mix\nBase\nOG Kush\n1\nMotor Oil\n2\nConstructor/);
  assert.doesNotMatch(resultText(ui), /bright_eyed|motor_oil/);
});

test("profit leads and the modifier result stays in a labelled native comparison", async () => {
  const ui = loadUi();
  await ui.form.listeners.submit(submitEvent());
  const worker = ui.workers[0];
  const result = successfulResult();
  result.best_modifier = {
    effects: ["modifier_effect"],
    substances: ["modifier_ingredient"],
    modifier: 0.91,
    sell_price: 75,
    substance_cost: 14,
  };
  result.best_profit = {
    effects: ["profit_effect"],
    substances: ["profit_ingredient"],
    modifier: 0.42,
    sell_price: 90,
    substance_cost: 8,
  };

  worker.emit({ type: "result", request_id: worker.sent[0].request_id, result });

  assert.equal(ui.result.children.length, 2);
  const profitCard = ui.result.children[0];
  const comparison = ui.result.children[1];
  assert.equal(profitCard.tagName, "article");
  assert.match(textOf(profitCard), /^Best Profit Combination/);
  assert.equal(comparison.tagName, "details");
  assert.equal(comparison.className, "result-comparison");
  assert.equal(comparison.children[0].tagName, "summary");
  assert.equal(comparison.children[0].textContent, "Compare highest modifier");
  assert.match(textOf(comparison.children[1]), /^Best Modifier Combination/);
  assert.equal(textOf(profitCard).match(/Optimality proven/g)?.length, 1);
  assert.equal(textOf(comparison).match(/Optimality proven/g)?.length, 1);

  for (const [card, modifier] of [
    [profitCard, "0.42"],
    [comparison.children[1], "0.91"],
  ]) {
    const labels = descendants(card)
      .filter((node) => node.tagName === "dt" || node.className === "chips-label")
      .map((node) => node.textContent);
    assert.deepEqual(labels, [
      "Profit",
      "Sell Price",
      "Ingredient Cost",
      "Modifier",
      "Mix",
      "Effects · 1",
    ]);
    const values = descendants(card)
      .filter((node) => node.tagName === "dd")
      .map((node) => node.textContent);
    assert.equal(values[3], modifier);
  }
  assert.equal(
    descendants(ui.result).filter((node) => ["progress", "status-block"].includes(node.className))
      .length,
    0,
    "a finished result holds no progress",
  );

  const fastUi = loadUi({}, "fast");
  await fastUi.form.listeners.submit(submitEvent());
  const fastWorker = fastUi.workers[0];
  fastWorker.emit({
    type: "result",
    request_id: fastWorker.sent[0].request_id,
    result: successfulResult("fast"),
  });
  assert.equal(
    resultText(fastUi).match(/Approximate result — optimality not guaranteed/g)?.length,
    2,
  );
});

test("both search modes color effects from the catalog and keep invalid or missing colors neutral", async () => {
  const descendants = (node) => [node, ...node.children.flatMap(descendants)];
  for (const mode of ["exact", "fast"]) {
    const ui = loadUi(
      {
        effects: [
          { name: "energizing", color: "#9afe6d" },
          { name: "toxic", color: "#5f9a31; background: red" },
        ],
        substances: [{ name: "cuke", color: "#9afe6d" }],
      },
      mode,
    );
    await ui.form.listeners.submit(submitEvent());
    const worker = ui.workers[0];
    const result = successfulResult(mode);
    result.best_profit.effects = ["energizing", "toxic", "unknown_effect"];
    worker.emit({ type: "result", request_id: worker.sent[0].request_id, result });
    const chips = descendants(ui.result).filter((node) => node.tagName === "li");
    assert.equal(chips.filter((node) => node.className === "effect-chip").length, 2);
    for (const chip of chips) {
      assert.equal(
        chip.attributes.style,
        chip.textContent === "Energizing" ? "--effect-color: #9afe6d" : undefined,
      );
    }
    assert.match(resultText(ui), /Unknown Effect/);
  }
});

test("search mode uses one static explanation for both radio choices", () => {
  const ui = loadUi({}, "exact");

  assert.equal(ui.modeInputs.exact.checked, true);
  assert.equal(ui.modeInputs.fast.checked, false);
  assert.match(ui.modeHint.textContent, /Exact proves the best mix/);
  assert.match(ui.modeHint.textContent, /up to 5 min/);
  assert.match(ui.modeHint.textContent, /Fast gives a quick estimate/);
  assert.match(
    ui.modeHint.textContent,
    /If stopped, the best result found is kept without a guarantee/,
  );
  const hint = ui.modeHint.textContent;
  selectMode(ui, "fast");
  assert.equal(ui.modeHint.textContent, hint, "the shared explanation does not swap by mode");
});

test("radio selection is captured at submit with the matching watchdog budget", async () => {
  const exactUi = loadUi();
  const exactSubmit = exactUi.form.listeners.submit(submitEvent());
  selectMode(exactUi, "fast");
  await exactSubmit;
  assert.equal(exactUi.timers[0].delay, 305_000);
  assert.equal(exactUi.workers[0].sent[0].request.search_mode, "exact");

  const fastUi = loadUi({}, "fast");
  await fastUi.form.listeners.submit(submitEvent());
  assert.equal(fastUi.timers[0].delay, 20_000);
  assert.equal(fastUi.workers[0].sent[0].request.search_mode, "fast");
});

test("worker errors use readable catalog names at the display boundary", async () => {
  const ui = loadUi({
    level_display_names: { street_rat_i: "Street Rat I" },
    substances: [{ name: "motor_oil", display_name: "Motor Oil" }],
  });
  await ui.form.listeners.submit(submitEvent());
  const worker = ui.workers[0];

  worker.emit({
    type: "error",
    request_id: worker.sent[0].request_id,
    error: "motor_oilspill differs from motor_oil at street_rat_i",
    search: { mode: "exact", status: "error", optimality_proven: false },
  });

  assert.match(resultText(ui), /Motor Oilspill differs from Motor Oil at Street Rat I/);
  assert.doesNotMatch(resultText(ui), /motor_oil|street_rat_i/);
  assert.equal(ui.result.children[0].attributes.role, "alert");
});

test("malformed catalog data cannot suppress a worker error", async () => {
  const ui = loadUi({ effects: {}, substances: [null] });
  await ui.form.listeners.submit(submitEvent());
  const worker = ui.workers[0];

  worker.emit({
    type: "error",
    request_id: worker.sent[0].request_id,
    error: "catalog.effects must be an array",
    search: { mode: "exact", status: "error", optimality_proven: false },
  });

  assert.match(resultText(ui), /catalog\.effects must be an array/);
  assert.match(resultText(ui), /No result was produced/);
  assert.equal(worker.terminateCalls, 1);
  assert.equal(ui.submitButton.disabled, false);
  assert.equal(ui.result.children[0].attributes.role, "alert");
});

function productCatalog() {
  return {
    effects: [{ name: "energizing", display_name: "Energizing" }],
    products: [{ name: "og_kush", display_name: "OG Kush", type: "Weed" }],
    substances: [{ name: "cuke", display_name: "Cuke", price_cents: 200 }],
  };
}

function motionStubs({ reduce = false, frames = true } = {}) {
  const queue = [];
  const stubs = {
    matchMedia(query) {
      stubs.queries.push(query);
      return { matches: reduce };
    },
    queries: [],
  };
  if (frames) {
    stubs.requestAnimationFrame = (callback) => {
      queue.push(callback);
      return queue.length;
    };
  }
  stubs.step = (now) => {
    const callbacks = queue.splice(0);
    for (const callback of callbacks) callback(now);
    return callbacks.length;
  };
  return stubs;
}

async function runToResult(ui, result = successfulResult()) {
  await ui.form.listeners.submit(submitEvent());
  const worker = ui.workers[0];
  worker.emit({ type: "result", request_id: worker.sent[0].request_id, result });
}

function accessibleText(node) {
  if (node.attributes?.["aria-hidden"] === "true") return "";
  return [node.textContent, ...node.children.map(accessibleText)].filter(Boolean).join("");
}

function profitValue(card) {
  const stat = descendants(card).find((node) => node.className === "stat stat--primary");
  return stat.children[1];
}

test("two consecutive progress messages keep the same status block with the new text", async () => {
  const ui = loadUi();
  await ui.form.listeners.submit(submitEvent());
  const worker = ui.workers[0];
  const request_id = worker.sent[0].request_id;
  const block = ui.result.children[0];
  assert.equal(block.className, "status-block");

  worker.emit({ type: "progress", request_id, progress: { depth: 1 } });
  assert.equal(ui.result.children.length, 1);
  assert.equal(ui.result.children[0], block, "first progress message reuses the node");
  assert.equal(block.children[0].textContent, "Searching locally — depth 1");

  worker.emit({ type: "progress", request_id, progress: { depth: 2 } });
  assert.equal(ui.result.children[0], block, "second progress message reuses the node");
  assert.equal(block.children[0].textContent, "Searching locally — depth 2");
  assert.equal(block.children.length, 2, "text and progress track only");
});

test("a progress message rebuilds the block when the result holds something else", async () => {
  const ui = loadUi();
  await runToResult(ui);
  const card = ui.result.children[0];
  assert.notEqual(card.className, "status-block");
  await ui.form.listeners.submit(submitEvent());
  assert.equal(ui.result.children.length, 1);
  assert.equal(ui.result.children[0].className, "status-block");
  assert.notEqual(ui.result.children[0], card);
});

test("no count-up and no reveal when reduced motion is requested or frames are missing", async () => {
  for (const options of [{ reduce: true }, { frames: false }]) {
    const stubs = motionStubs(options);
    const ui = loadUi(productCatalog(), "exact", stubs);
    await runToResult(ui);
    const all = descendants(ui.result);
    assert.equal(all.filter((node) => node.className === "count-up").length, 0);
    assert.equal(all.filter((node) => String(node.className).includes("is-revealing")).length, 0);
    assert.equal(stubs.step(0), 0, "no animation frame was requested");
    assert.equal(profitValue(ui.result.children[0]).textContent, "$40.70");
  }
  const noMatchMedia = motionStubs();
  delete noMatchMedia.matchMedia;
  const ui = loadUi(productCatalog(), "exact", noMatchMedia);
  await runToResult(ui);
  assert.equal(descendants(ui.result).filter((node) => node.className === "count-up").length, 0);
});

test("with motion allowed the overlay counts up while the value text stays final", async () => {
  const stubs = motionStubs();
  const ui = loadUi(productCatalog(), "exact", stubs);
  await runToResult(ui);
  assert.deepEqual(stubs.queries, ["(prefers-reduced-motion: reduce)"]);

  const [profitCard, comparison] = [ui.result.children[0], ui.result.children[1]];
  assert.match(profitCard.className, /(^| )is-revealing( |$)/);
  const value = profitValue(profitCard);
  assert.equal(value.textContent, "$40.70", "the dd text is always the final value");
  const overlays = descendants(profitCard).filter((node) => node.className === "count-up");
  assert.equal(overlays.length, 1);
  assert.equal(overlays[0].attributes["aria-hidden"], "true");
  assert.equal(accessibleText(value), "$40.70", "assistive technology sees the final value only");
  assert.deepEqual(overlays[0].style.writes, [], "the overlay gets no inline style");
  assert.deepEqual(value.style.writes, [], "the value gets no inline style");
  assert.equal(
    value.children.includes(overlays[0]),
    true,
    "the overlay sits inside the dd, which styles.css hides while it is there",
  );
  assert.equal(
    descendants(comparison).filter((node) => node.className === "count-up").length,
    0,
    "the comparison card is not animated",
  );
  assert.doesNotMatch(comparison.children[1].className, /is-revealing/);

  stubs.step(0);
  stubs.step(275);
  assert.match(overlays[0].textContent, /^\$\d+\.\d\d$/);
  assert.notEqual(overlays[0].textContent, "$40.70");
  assert.equal(value.children.includes(overlays[0]), true);
  stubs.step(600);
  assert.equal(value.children.includes(overlays[0]), false, "overlay is removed at the end");
  assert.deepEqual(value.style.writes, [], "the value has no inline style to clean up");
  assert.equal(value.textContent, "$40.70");

  assert.ok(
    ui.timers.some(({ delay }) => delay === 450),
    "reveal is removed after the motion time",
  );
  assert.equal(typeof profitCard.listeners.animationend, "function");
  profitCard.listeners.animationend();
  assert.doesNotMatch(profitCard.className, /is-revealing/);
});

test("results show a base tile and step prices on the main and comparison cards", async () => {
  const ui = loadUi(productCatalog());
  const result = successfulResult();
  result.best_profit = { ...result.best_profit, substances: ["cuke", "cuke"] };
  await runToResult(ui, result);
  const cards = [ui.result.children[0], ui.result.children[1].children[1]];
  for (const card of cards) {
    const list = descendants(card).find((node) => node.tagName === "ol");
    assert.equal(list.className, "chips chips--ordered mix");
    const tiles = list.children;
    assert.equal(tiles[0].className, "mix__item mix__item--base");
    assert.deepEqual(
      tiles[0].children.map((node) => [node.className, node.textContent]),
      [
        ["mix__step", "Base"],
        ["mix__name", "OG Kush"],
        ["mix__meta", "Weed"],
      ],
    );
    assert.equal(tiles[1].className, "mix__item");
    assert.deepEqual(
      tiles[1].children.map((node) => [node.className, node.textContent]),
      [
        ["mix__step", "1"],
        ["mix__name", "Cuke"],
        ["mix__price", "$2.00"],
      ],
    );
  }
});

test("money is formatted game-style for profit, sell price, and ingredient cost", async () => {
  const cases = [
    [72, 2, "$70.00", "$72.00", "$2.00"],
    [2488, 2, "$2,486.00", "$2,488.00", "$2.00"],
    [1.5, 7, "-$5.50", "$1.50", "$7.00"],
    [2, 2.001, "$0.00", "$2.00", "$2.00"],
    [1234567.891, 0, "$1,234,567.89", "$1,234,567.89", "$0.00"],
  ];
  for (const [sell, cost, profit, sellText, costText] of cases) {
    const ui = loadUi(productCatalog());
    const result = successfulResult();
    result.best_profit = { ...result.best_profit, sell_price: sell, substance_cost: cost };
    await runToResult(ui, result);
    const values = descendants(ui.result.children[0])
      .filter((node) => node.tagName === "dd")
      .map((node) => node.textContent);
    assert.deepEqual(values.slice(0, 3), [profit, sellText, costText]);
    assert.equal(values[3], "0.22", "modifier is an additive value with two decimals, no ×");
  }
});
