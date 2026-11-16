"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const engine = require(path.resolve(__dirname, "../../webapp/static/js/search-engine.js"));
const scriptSource = fs.readFileSync(
  path.resolve(__dirname, "../../webapp/static/js/script.js"),
  "utf8",
);

function catalog() {
  return {
    effect_scale: 100,
    effects: [
      {
        color: "#ffd19b",
        description: "Keeps the user steady.",
        display_name: "Calming",
        modifier: 0.1,
        modifier_units: 10,
        name: "calming",
      },
      {
        color: "#75f2ff",
        description: "Improves concentration.",
        display_name: "Focused",
        modifier: 0.2,
        modifier_units: 20,
        name: "focused",
      },
      {
        color: "#bff8ff",
        description: "Makes the user more alert.",
        display_name: "Bright Eyed",
        modifier: 0.3,
        modifier_units: 30,
        name: "bright_eyed",
      },
    ],
    levels: { low: 0, max: 1 },
    model_hash: "effect-ui-test-model",
    money_scale: 100,
    products: [
      {
        base_price_cents: 1000,
        display_name: "OG Kush",
        effects: ["calming"],
        name: "og_kush",
      },
    ],
    product_version: "test",
    schema_version: 1,
    substances: [
      {
        display_name: "Motor Oil",
        level: 1,
        name: "motor_oil",
        price_cents: 100,
        replacements: [["calming", "focused"]],
        resulting_effect: "bright_eyed",
      },
    ],
  };
}

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

function loadUi({
  fetchOutcomes = [catalog()],
  workerAvailable = true,
  windowProperties = {},
  workerConstructorError = null,
} = {}) {
  const domReady = [];
  const evaluations = [];
  const fetchCalls = [];
  const timers = [];
  const workers = [];
  let activeElement = null;
  let fetchIndex = 0;
  let nextTimer = 1;

  function element(properties = {}) {
    const node = {
      attributes: {},
      checked: false,
      children: [],
      className: "",
      dataset: {},
      disabled: false,
      hidden: false,
      listeners: {},
      style: inlineStyle(),
      textContent: "",
      value: "",
      ...properties,
      addEventListener(type, listener) {
        this.listeners[type] = listener;
      },
      appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        return child;
      },
      classList: {
        add(...names) {
          const classes = new Set(node.className.split(/\s+/).filter(Boolean));
          for (const name of names) classes.add(name);
          node.className = [...classes].join(" ");
        },
        contains: (name) => node.className.split(/\s+/).includes(name),
        remove(...names) {
          node.className = node.className
            .split(/\s+/)
            .filter((name) => name && !names.includes(name))
            .join(" ");
        },
      },
      focus() {
        activeElement = this;
      },
      remove() {
        if (!this.parentNode) return;
        this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
        this.parentNode = null;
      },
      replaceChildren(...children) {
        this.children = [];
        for (const child of children) this.appendChild(child);
      },
      setAttribute(name, value) {
        this.attributes[name] = String(value);
      },
    };
    return node;
  }

  const searchSubmit = element({ tagName: "button" });
  const searchMode = element({ checked: true, value: "exact" });
  const searchForm = element({
    dataset: { searchDataUrl: "/search-data", workerUrl: "/effect-worker.js" },
    querySelector(selector) {
      return selector === 'button[type="submit"]' ? searchSubmit : searchMode;
    },
  });
  const effectSubmit = element({ disabled: true, tagName: "button" });
  const effectModes = {
    exact: element({ checked: true, value: "exact" }),
    fast: element({ value: "fast" }),
  };
  effectModes.exact.name = "effect_search_mode";
  effectModes.fast.name = "effect_search_mode";
  const matchModes = {
    contains: element({ name: "effect_match_mode", value: "contains" }),
    exact: element({ checked: true, name: "effect_match_mode", value: "exact" }),
  };
  const effectForm = element({
    querySelector(selector) {
      return selector.includes("effect_match_mode")
        ? Object.values(matchModes).find((input) => input.checked)
        : Object.values(effectModes).find((input) => input.checked);
    },
  });
  const elements = {
    "best-mix-form": searchForm,
    "cancel-effects": element({ hidden: true, tagName: "button" }),
    "cancel-search": element({ hidden: true, tagName: "button" }),
    "clear-effects": element({ disabled: true, tagName: "button" }),
    "combination-size": element({ value: "2" }),
    "effect-filter": element({ disabled: true }),
    "effect-form": effectForm,
    "effect-level": element({ disabled: true, value: "max" }),
    "effect-max-ingredients": element({ disabled: true, value: "6" }),
    "effect-options": element(),
    "effect-panel": element({ hidden: true }),
    "effect-product": element({ disabled: true, value: "og_kush" }),
    "effect-result": element(),
    "effect-match-hint": element(),
    "effect-search-mode-exact": effectModes.exact,
    "effect-search-mode-fast": effectModes.fast,
    "effect-selection-count": element(),
    "effect-selection-summary": element(),
    "effect-tab": element({ attributes: { "aria-selected": "false" }, tabIndex: -1 }),
    "find-effects": effectSubmit,
    level: element({ value: "max" }),
    "product-name": element({ value: "og_kush" }),
    "recipe-panel": element({ hidden: true }),
    "recipe-tab": element({ attributes: { "aria-selected": "false" }, tabIndex: -1 }),
    result: element(),
    "retry-effects": element({ hidden: true, tagName: "button" }),
    "search-panel": element(),
    "search-tab": element({ attributes: { "aria-selected": "true" }, tabIndex: 0 }),
  };

  class FakeWorker {
    constructor(url) {
      if (workerConstructorError) throw workerConstructorError;
      this.listeners = {};
      this.sent = [];
      this.terminateCalls = 0;
      this.url = url;
      workers.push(this);
    }

    addEventListener(type, listener) {
      this.listeners[type] = listener;
    }

    emit(data) {
      this.listeners.message({ data });
    }

    postMessage(message) {
      this.sent.push(message);
    }

    terminate() {
      this.terminateCalls += 1;
    }
  }

  const window = element({
    ...windowProperties,
    Schedule1Search: {
      ...engine,
      evaluateRecipe(loadedCatalog, request) {
        evaluations.push({ ...request, substances: [...request.substances] });
        return engine.evaluateRecipe(loadedCatalog, request);
      },
    },
  });
  const context = {
    AbortController,
    Error,
    Worker: workerAvailable ? FakeWorker : undefined,
    clearTimeout() {},
    document: {
      addEventListener(type, listener) {
        if (type === "DOMContentLoaded") domReady.push(listener);
      },
      createElement: (tagName) => element({ tagName }),
      getElementById: (id) => elements[id] ?? null,
    },
    fetch: async (url, options) => {
      fetchCalls.push({ options, url });
      const outcome = fetchOutcomes[Math.min(fetchIndex, fetchOutcomes.length - 1)];
      fetchIndex += 1;
      if (outcome instanceof Error) throw outcome;
      return { json: async () => outcome, ok: true, status: 200 };
    },
    setTimeout(callback, delay) {
      timers.push({ callback, delay, id: nextTimer });
      nextTimer += 1;
      return nextTimer - 1;
    },
    window,
  };
  vm.runInNewContext(scriptSource, context, { filename: "script.js" });
  assert.equal(domReady.length, 1);
  domReady[0]();

  return {
    activeElement: () => activeElement,
    effectForm,
    elements,
    evaluations,
    fetchCalls,
    matchModes,
    timers,
    workers,
  };
}

function event(properties = {}) {
  return { preventDefault() {}, ...properties };
}

function textOf(node) {
  return [node.textContent, ...node.children.map(textOf)].filter(Boolean).join("\n");
}

async function openEffects(ui) {
  ui.elements["effect-tab"].listeners.click();
  await new Promise((resolve) => setImmediate(resolve));
}

function effectOption(ui, name) {
  return ui.elements["effect-options"].children.find((candidate) =>
    candidate.children[2]?.children.some(
      (label) => label.children[0]?.name === `effect_preference_${name}`,
    ),
  );
}

function preferenceInput(option, value) {
  return option.children[2].children.find((label) => label.children[0].value === value).children[0];
}

function choose(ui, name, preference = "wanted") {
  const option = effectOption(ui, name);
  for (const label of option.children[2].children) label.children[0].checked = false;
  const input = preferenceInput(option, preference);
  input.checked = true;
  input.listeners.change();
  return option;
}

function setMatchMode(ui, mode) {
  for (const input of Object.values(ui.matchModes)) input.checked = input.value === mode;
  ui.effectForm.listeners.change({ target: ui.matchModes[mode] });
}

function effectResult({
  excluded = [],
  matchMode = "exact",
  mode = "exact",
  status = "optimal",
  substances = [],
  targets,
}) {
  return {
    excluded_effects: excluded,
    match_mode: matchMode,
    recipe:
      status === "not_found"
        ? null
        : engine.evaluateRecipe(catalog(), { product_name: "og_kush", substances }),
    search: {
      mode,
      optimality_proven: mode === "exact" && status !== "incomplete",
      status,
    },
    stats: {},
    target_effects: targets,
  };
}

test("effect cancellation and watchdog preserve validated matches without proving shortest", async () => {
  for (const ending of ["cancel", "watchdog", "tab", "limit"]) {
    const ui = loadUi();
    await openEffects(ui);
    setMatchMode(ui, "contains");
    choose(ui, "focused");
    choose(ui, "calming", "excluded");
    await ui.effectForm.listeners.submit(event());
    const worker = ui.workers[0];
    const request_id = worker.sent[0].request_id;
    const result = effectResult({
      status: "incomplete",
      matchMode: "contains",
      targets: ["focused"],
      excluded: ["calming"],
      substances: ["motor_oil"],
    });
    worker.emit({ type: "checkpoint", request_id, result });
    if (ending === "cancel") ui.elements["cancel-effects"].listeners.click();
    if (ending === "watchdog") ui.timers.find(({ delay }) => delay === 305_000).callback();
    if (ending === "tab") await ui.elements["search-tab"].listeners.click();
    if (ending === "limit")
      worker.emit({
        type: "error",
        request_id,
        result,
        error: "Work limit reached.",
        search: { mode: "exact", status: "incomplete", optimality_proven: false },
      });
    const text = textOf(ui.elements["effect-result"]);
    assert.match(text, /best matching recipe found so far/i);
    assert.match(text, /Motor Oil/);
    assert.match(text, /Search stopped — optimality not proven/);
    assert.doesNotMatch(text, /Optimality proven|Shortest matching recipe|No result was produced/);
    const badges = descendantsOf(ui.elements["effect-result"]).filter((node) =>
      String(node.className).startsWith("badge"),
    );
    assert.equal(badges.length, 1);
    assert.equal(badges[0].className, "badge badge--stopped");
    assert.equal(badges[0].textContent, "Search stopped — optimality not proven");
    assert.equal(worker.terminateCalls, 1);
    assert.equal(ui.elements["find-effects"].disabled, false);
    worker.emit({ type: "result", request_id, result: effectResult({ targets: ["calming"] }) });
    assert.equal(textOf(ui.elements["effect-result"]), text);
  }
});

test("stopped effect searches with no candidate never claim that no match exists", async () => {
  const ui = loadUi();
  await openEffects(ui);
  choose(ui, "calming");
  await ui.effectForm.listeners.submit(event());
  ui.elements["cancel-effects"].listeners.click();
  assert.match(textOf(ui.elements["effect-result"]), /No matching recipe was found before/);
  assert.match(textOf(ui.elements["effect-result"]), /does not prove that no match exists/);
});

test("effect checkpoints reject avoided effects and proof claims; changed inputs discard candidates", async () => {
  for (const kind of ["avoided", "proven", "settings"]) {
    const ui = loadUi();
    await openEffects(ui);
    setMatchMode(ui, "contains");
    choose(ui, "focused");
    choose(ui, "calming", "excluded");
    await ui.effectForm.listeners.submit(event());
    const worker = ui.workers[0];
    const request_id = worker.sent[0].request_id;
    const result = effectResult({
      status: "incomplete",
      matchMode: "contains",
      targets: ["focused"],
      excluded: ["calming"],
      substances: ["motor_oil"],
    });
    if (kind === "avoided") result.recipe.effects.push("calming");
    if (kind === "proven") result.search.optimality_proven = true;
    worker.emit({ type: "checkpoint", request_id, result });
    if (kind === "settings") {
      choose(ui, "bright_eyed");
      assert.match(textOf(ui.elements["effect-result"]), /settings changed/);
      await ui.effectForm.listeners.submit(event());
      worker.emit({ type: "checkpoint", request_id, result });
      ui.elements["cancel-effects"].listeners.click();
      assert.match(textOf(ui.elements["effect-result"]), /No matching recipe was found/);
    } else {
      assert.match(textOf(ui.elements["effect-result"]), /invalid intermediate result/);
    }
    assert.doesNotMatch(
      textOf(ui.elements["effect-result"]),
      /Best matching recipe found so far|Optimality proven/,
    );
  }
});

test("renders filterable effect choices with colors, descriptions, retained selection, and clear", async () => {
  const ui = loadUi();
  await openEffects(ui);
  const options = ui.elements["effect-options"];
  assert.equal(options.children.length, 4);
  const calming = options.children[0];
  assert.equal(calming.className, "effect-option");
  assert.equal(calming.tagName, "fieldset");
  assert.equal(calming.dataset.preference, "neutral");
  assert.equal(calming.children[0].tagName, "legend");
  assert.equal(calming.children[0].className, "effect-option__heading");
  assert.equal(calming.children[0].children[0].className, "effect-swatch");
  assert.equal(calming.children[0].children[0].attributes.style, "--effect-color: #ffd19b");
  assert.equal(calming.attributes["aria-describedby"], "effect-description-calming");
  assert.equal(calming.children[1].tagName, "p");
  assert.deepEqual(
    calming.children[2].children.map((label) => label.children[0].value),
    ["wanted", "neutral", "excluded"],
  );
  assert.deepEqual(
    calming.children[2].children.map((label) => label.children[0].name),
    ["effect_preference_calming", "effect_preference_calming", "effect_preference_calming"],
  );
  assert.deepEqual(
    calming.children[2].children.map((label) => label.children[1].textContent),
    ["Want", "Neutral", "Avoid"],
  );
  assert.equal(preferenceInput(calming, "neutral").checked, true);
  assert.equal(preferenceInput(calming, "wanted").type, "radio");
  assert.match(textOf(calming), /Calming\nKeeps the user steady/);

  choose(ui, "calming");
  assert.equal(calming.dataset.preference, "wanted");
  assert.equal(ui.elements["effect-selection-count"].textContent, "1 wanted · 0 avoided");
  assert.match(textOf(ui.elements["effect-selection-summary"]), /Want: Calming/);
  assert.equal(ui.elements["find-effects"].disabled, false);
  ui.elements["effect-filter"].value = "concentration";
  ui.elements["effect-filter"].listeners.input();
  assert.equal(calming.hidden, true);
  assert.equal(
    preferenceInput(calming, "wanted").checked,
    true,
    "filtering keeps hidden targets selected",
  );
  ui.elements["effect-filter"].value = "missing";
  ui.elements["effect-filter"].listeners.input();
  assert.equal(options.children.at(-1).hidden, false);

  ui.elements["clear-effects"].listeners.click();
  assert.equal(preferenceInput(calming, "neutral").checked, true);
  assert.equal(calming.dataset.preference, "neutral");
  assert.equal(ui.elements["effect-selection-count"].textContent, "0 wanted · 0 avoided");
  assert.equal(ui.activeElement(), ui.elements["effect-filter"]);
});

test("submits captured targets and mode, accepts a zero-step base match, and renders guidance", async () => {
  const ui = loadUi();
  await openEffects(ui);
  choose(ui, "calming");
  await ui.effectForm.listeners.submit(event());
  const worker = ui.workers[0];
  assert.equal(worker.sent[0].type, "search_effects");
  assert.deepEqual(JSON.parse(JSON.stringify(worker.sent[0].request)), {
    combination_size: 6,
    excluded_effects: [],
    level: "max",
    match_mode: "exact",
    product_name: "og_kush",
    search_mode: "exact",
    target_effects: ["calming"],
  });
  assert.equal(ui.timers.find(({ delay }) => delay === 305_000).delay, 305_000);
  worker.emit({
    request_id: worker.sent[0].request_id,
    result: effectResult({ substances: [], targets: ["calming"] }),
    type: "result",
  });
  assert.match(textOf(ui.elements["effect-result"]), /Shortest recipe with only wanted effects/);
  assert.match(textOf(ui.elements["effect-result"]), /What these effects do/);
  assert.match(textOf(ui.elements["effect-result"]), /Keeps the user steady/);
  assert.deepEqual(ui.evaluations.at(-1).substances, []);
});

test("distinguishes proven and unproven no-match results and rejects extras", async () => {
  const exactUi = loadUi();
  await openEffects(exactUi);
  choose(exactUi, "calming");
  await exactUi.effectForm.listeners.submit(event());
  let worker = exactUi.workers[0];
  worker.emit({
    request_id: worker.sent[0].request_id,
    result: effectResult({ status: "not_found", targets: ["calming"] }),
    type: "result",
  });
  assert.match(textOf(exactUi.elements["effect-result"]), /proven for these settings/);

  const fastUi = loadUi();
  await openEffects(fastUi);
  choose(fastUi, "calming");
  fastUi.elements["effect-search-mode-exact"].checked = false;
  fastUi.elements["effect-search-mode-fast"].checked = true;
  await fastUi.effectForm.listeners.submit(event());
  worker = fastUi.workers[0];
  assert.equal(worker.sent[0].request.search_mode, "fast");
  assert.equal(fastUi.timers.find(({ delay }) => delay === 20_000).delay, 20_000);
  worker.emit({
    request_id: worker.sent[0].request_id,
    result: effectResult({ mode: "fast", status: "not_found", targets: ["calming"] }),
    type: "result",
  });
  assert.match(textOf(fastUi.elements["effect-result"]), /does not prove/);

  const invalidUi = loadUi();
  await openEffects(invalidUi);
  choose(invalidUi, "calming");
  await invalidUi.effectForm.listeners.submit(event());
  worker = invalidUi.workers[0];
  const forged = effectResult({ substances: ["motor_oil"], targets: ["calming"] });
  forged.recipe.effects = ["calming"];
  worker.emit({ request_id: worker.sent[0].request_id, result: forged, type: "result" });
  assert.match(textOf(invalidUi.elements["effect-result"]), /invalid or incomplete/);
  assert.doesNotMatch(textOf(invalidUi.elements["effect-result"]), /Shortest recipe/);

  const duplicateUi = loadUi();
  await openEffects(duplicateUi);
  choose(duplicateUi, "calming");
  await duplicateUi.effectForm.listeners.submit(event());
  worker = duplicateUi.workers[0];
  worker.emit({
    request_id: worker.sent[0].request_id,
    result: effectResult({ targets: ["calming", "calming"] }),
    type: "result",
  });
  assert.match(textOf(duplicateUi.elements["effect-result"]), /invalid or incomplete/);

  const lockedUi = loadUi();
  await openEffects(lockedUi);
  choose(lockedUi, "focused");
  choose(lockedUi, "bright_eyed");
  lockedUi.elements["effect-level"].value = "low";
  await lockedUi.effectForm.listeners.submit(event());
  worker = lockedUi.workers[0];
  worker.emit({
    request_id: worker.sent[0].request_id,
    result: effectResult({ substances: ["motor_oil"], targets: ["focused", "bright_eyed"] }),
    type: "result",
  });
  assert.match(textOf(lockedUi.elements["effect-result"]), /invalid or incomplete/);
});

test("effect input changes discard stale results and clear focuses a visible control", async () => {
  const ui = loadUi();
  await openEffects(ui);
  choose(ui, "calming");
  await ui.effectForm.listeners.submit(event());
  const firstWorker = ui.workers[0];
  choose(ui, "focused");
  assert.equal(firstWorker.terminateCalls, 1);
  firstWorker.emit({
    request_id: firstWorker.sent[0].request_id,
    result: effectResult({ substances: [], targets: ["calming"] }),
    type: "result",
  });
  assert.doesNotMatch(textOf(ui.elements["effect-result"]), /Shortest recipe/);

  ui.elements["effect-filter"].value = "missing";
  ui.elements["effect-filter"].listeners.input();
  ui.elements["clear-effects"].listeners.click();
  assert.equal(ui.activeElement(), ui.elements["effect-filter"]);

  choose(ui, "calming");
  await ui.effectForm.listeners.submit(event());
  const secondWorker = ui.workers[1];
  secondWorker.emit({
    request_id: secondWorker.sent[0].request_id,
    result: effectResult({ substances: [], targets: ["calming"] }),
    type: "result",
  });
  assert.match(textOf(ui.elements["effect-result"]), /Shortest recipe/);
  ui.elements["effect-max-ingredients"].listeners.input();
  assert.equal(ui.elements["effect-result"].children.length, 0);
});

test("summary chips remove one preference and keep focus in the effect controls", async () => {
  const ui = loadUi();
  await openEffects(ui);
  const calming = choose(ui, "calming");
  choose(ui, "focused", "excluded");
  assert.equal(ui.elements["effect-selection-count"].textContent, "1 wanted · 1 avoided");
  assert.equal(ui.elements["effect-selection-summary"].children.length, 2);
  const wantedChip = ui.elements["effect-selection-summary"].children[0];
  assert.equal(wantedChip.tagName, "button");
  assert.equal(wantedChip.dataset.preference, "wanted");
  assert.equal(wantedChip.attributes["aria-label"], "Remove Calming from wanted effects");

  ui.elements["effect-filter"].value = "concentration";
  ui.elements["effect-filter"].listeners.input();
  assert.equal(calming.hidden, true);
  wantedChip.listeners.click();
  assert.equal(preferenceInput(calming, "neutral").checked, true);
  assert.equal(ui.elements["effect-selection-count"].textContent, "0 wanted · 1 avoided");
  assert.equal(ui.activeElement(), ui.elements["effect-filter"]);
});

test("allow-extras mode supports exclusion-only searches and mode changes cancel stale work", async () => {
  const ui = loadUi();
  await openEffects(ui);
  choose(ui, "focused", "excluded");
  assert.equal(ui.elements["find-effects"].disabled, true, "only-these mode still needs a target");
  setMatchMode(ui, "contains");
  assert.equal(ui.elements["find-effects"].disabled, false);
  assert.equal(
    ui.elements["effect-match-hint"].textContent,
    "Wanted effects must be present; avoided effects must be absent. Other effects are allowed.",
  );
  await ui.effectForm.listeners.submit(event());
  const worker = ui.workers[0];
  assert.deepEqual(JSON.parse(JSON.stringify(worker.sent[0].request)), {
    combination_size: 6,
    excluded_effects: ["focused"],
    level: "max",
    match_mode: "contains",
    product_name: "og_kush",
    search_mode: "exact",
    target_effects: [],
  });

  setMatchMode(ui, "exact");
  assert.equal(worker.terminateCalls, 1);
  assert.equal(preferenceInput(effectOption(ui, "focused"), "excluded").checked, true);
  assert.match(textOf(ui.elements["effect-result"]), /cancelled because its settings changed/);
  assert.equal(ui.elements["find-effects"].disabled, true);
});

test("allow-extras validation accepts extras, rejects avoided effects, and verifies metadata", async () => {
  const validUi = loadUi();
  await openEffects(validUi);
  choose(validUi, "focused");
  setMatchMode(validUi, "contains");
  await validUi.effectForm.listeners.submit(event());
  let worker = validUi.workers[0];
  worker.emit({
    request_id: worker.sent[0].request_id,
    result: effectResult({
      matchMode: "contains",
      substances: ["motor_oil"],
      targets: ["focused"],
    }),
    type: "result",
  });
  assert.match(textOf(validUi.elements["effect-result"]), /Shortest matching recipe/);
  assert.match(textOf(validUi.elements["effect-result"]), /Bright Eyed/);

  const excludedUi = loadUi();
  await openEffects(excludedUi);
  choose(excludedUi, "focused");
  choose(excludedUi, "bright_eyed", "excluded");
  setMatchMode(excludedUi, "contains");
  await excludedUi.effectForm.listeners.submit(event());
  worker = excludedUi.workers[0];
  worker.emit({
    request_id: worker.sent[0].request_id,
    result: effectResult({
      excluded: ["bright_eyed"],
      matchMode: "contains",
      substances: ["motor_oil"],
      targets: ["focused"],
    }),
    type: "result",
  });
  assert.match(textOf(excludedUi.elements["effect-result"]), /invalid or incomplete/);

  for (const forgedField of ["match_mode", "excluded_effects"]) {
    const forgedUi = loadUi();
    await openEffects(forgedUi);
    choose(forgedUi, "calming");
    setMatchMode(forgedUi, "contains");
    await forgedUi.effectForm.listeners.submit(event());
    worker = forgedUi.workers[0];
    const result = effectResult({ matchMode: "contains", targets: ["calming"] });
    result[forgedField] = forgedField === "match_mode" ? "exact" : ["focused"];
    worker.emit({ request_id: worker.sent[0].request_id, result, type: "result" });
    assert.match(textOf(forgedUi.elements["effect-result"]), /invalid or incomplete/);
  }
});

test("no-match guidance describes the active recipe-match mode", async () => {
  const ui = loadUi();
  await openEffects(ui);
  choose(ui, "focused");
  choose(ui, "calming", "excluded");
  setMatchMode(ui, "contains");
  await ui.effectForm.listeners.submit(event());
  const worker = ui.workers[0];
  worker.emit({
    request_id: worker.sent[0].request_id,
    result: effectResult({
      excluded: ["calming"],
      matchMode: "contains",
      status: "not_found",
      targets: ["focused"],
    }),
    type: "result",
  });
  assert.match(textOf(ui.elements["effect-result"]), /wanted and avoided effects/);
  assert.doesNotMatch(textOf(ui.elements["effect-result"]), /only the wanted effects/);
});

test("tab switching cancels stale work, preserves inputs, and shares the catalog cache", async () => {
  const ui = loadUi();
  await ui.elements["best-mix-form"].listeners.submit(event());
  assert.equal(ui.fetchCalls.length, 1);
  const searchWorker = ui.workers[0];
  await openEffects(ui);
  assert.equal(searchWorker.terminateCalls, 1);
  assert.equal(ui.fetchCalls.length, 1, "effect search reuses the loaded search catalog");
  choose(ui, "calming");
  await ui.effectForm.listeners.submit(event());
  const effectWorker = ui.workers[1];
  ui.elements["recipe-tab"].listeners.click();
  assert.equal(effectWorker.terminateCalls, 1);
  assert.equal(preferenceInput(ui.elements["effect-options"].children[0], "wanted").checked, true);
  effectWorker.emit({
    request_id: effectWorker.sent[0].request_id,
    result: effectResult({ substances: [], targets: ["calming"] }),
    type: "result",
  });
  assert.doesNotMatch(textOf(ui.elements["effect-result"]), /Shortest recipe/);
  assert.match(textOf(ui.elements["effect-result"]), /cancelled when switching tabs/);

  ui.elements["effect-tab"].listeners.keydown(event({ key: "Home" }));
  assert.equal(ui.elements["search-tab"].attributes["aria-selected"], "true");
  ui.elements["search-tab"].listeners.keydown(event({ key: "ArrowLeft" }));
  assert.equal(ui.elements["effect-tab"].attributes["aria-selected"], "true");
});

test("load retry, worker errors, and browsers without workers expose recoverable errors", async () => {
  const retryUi = loadUi({ fetchOutcomes: [new Error("offline"), catalog()] });
  await openEffects(retryUi);
  assert.equal(retryUi.elements["retry-effects"].hidden, false);
  assert.match(textOf(retryUi.elements["effect-result"]), /offline/);
  assert.match(textOf(retryUi.elements["effect-result"]), /Reload the page and try again/);
  await retryUi.elements["retry-effects"].listeners.click();
  assert.equal(retryUi.elements["retry-effects"].hidden, true);
  choose(retryUi, "calming");
  await retryUi.effectForm.listeners.submit(event());
  const worker = retryUi.workers[0];
  worker.emit({
    error: "effect search failed",
    request_id: worker.sent[0].request_id,
    search: { mode: "exact", optimality_proven: false, status: "error" },
    type: "error",
  });
  assert.match(textOf(retryUi.elements["effect-result"]), /effect search failed/);
  assert.equal(retryUi.elements["find-effects"].disabled, false);

  const unsupported = loadUi({ workerAvailable: false });
  await openEffects(unsupported);
  assert.match(textOf(unsupported.elements["effect-result"]), /cannot run the effect search/);
  assert.equal(unsupported.elements["retry-effects"].hidden, false);

  const constructorUi = loadUi({ workerConstructorError: new Error("worker blocked") });
  await openEffects(constructorUi);
  choose(constructorUi, "calming");
  await constructorUi.effectForm.listeners.submit(event());
  assert.match(textOf(constructorUi.elements["effect-result"]), /could not start: worker blocked/);
  assert.equal(constructorUi.elements["effect-form"].attributes["aria-busy"], "false");
});

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

function descendantsOf(node) {
  return [node, ...node.children.flatMap(descendantsOf)];
}

function accessibleText(node) {
  if (node.attributes?.["aria-hidden"] === "true") return "";
  return [node.textContent, ...node.children.map(accessibleText)].filter(Boolean).join("");
}

async function effectResultFor(ui, substances = ["motor_oil"]) {
  await openEffects(ui);
  choose(ui, "focused");
  choose(ui, "bright_eyed");
  await ui.effectForm.listeners.submit(event());
  const worker = ui.workers[0];
  worker.emit({
    request_id: worker.sent[0].request_id,
    result: effectResult({ substances, targets: ["focused", "bright_eyed"] }),
    type: "result",
  });
  return ui.elements["effect-result"];
}

test("two consecutive effect progress messages keep the same status block with the new text", async () => {
  const ui = loadUi();
  await openEffects(ui);
  choose(ui, "calming");
  await ui.effectForm.listeners.submit(event());
  const worker = ui.workers[0];
  const request_id = worker.sent[0].request_id;
  const output = ui.elements["effect-result"];
  const block = output.children[0];
  assert.equal(block.className, "status-block");

  worker.emit({ type: "progress", request_id, progress: { depth: 1 } });
  assert.equal(output.children.length, 1);
  assert.equal(output.children[0], block, "first progress message reuses the node");
  assert.equal(block.children[0].textContent, "Searching locally — depth 1");

  worker.emit({ type: "progress", request_id, progress: { depth: 2 } });
  assert.equal(output.children[0], block, "second progress message reuses the node");
  assert.equal(block.children[0].textContent, "Searching locally — depth 2");
  assert.equal(block.children.length, 2, "text and progress track only");
});

test("no effect count-up and no reveal when reduced motion is requested or frames are missing", async () => {
  for (const options of [{ reduce: true }, { frames: false }]) {
    const stubs = motionStubs(options);
    const ui = loadUi({ windowProperties: stubs });
    const output = await effectResultFor(ui);
    const all = descendantsOf(output);
    assert.equal(all.filter((node) => node.className === "count-up").length, 0);
    assert.equal(all.filter((node) => String(node.className).includes("is-revealing")).length, 0);
    assert.equal(stubs.step(0), 0, "no animation frame was requested");
  }
});

test("effect results count up in an overlay while the profit text stays final", async () => {
  const stubs = motionStubs();
  const ui = loadUi({ windowProperties: stubs });
  const output = await effectResultFor(ui);
  const all = descendantsOf(output);
  const card = all.find((node) => node.tagName === "article");
  assert.match(card.className, /(^| )is-revealing( |$)/);
  const profit = all.find((node) => node.className === "stat stat--primary").children[1];
  assert.match(profit.textContent, /^-?\$\d[\d,]*\.\d\d$/);
  const overlays = all.filter((node) => node.className === "count-up");
  assert.equal(overlays.length, 1);
  assert.equal(overlays[0].attributes["aria-hidden"], "true");
  assert.equal(accessibleText(profit), profit.textContent);
  assert.equal(profit.children.includes(overlays[0]), true, "the overlay sits inside the dd");
  assert.deepEqual(overlays[0].style.writes, [], "the overlay gets no inline style");
  assert.deepEqual(profit.style.writes, [], "the value gets no inline style");
  stubs.step(0);
  stubs.step(700);
  assert.equal(profit.children.includes(overlays[0]), false, "overlay is removed at the end");
  assert.deepEqual(profit.style.writes, [], "the value has no inline style to clean up");
  card.listeners.animationend();
  assert.doesNotMatch(card.className, /is-revealing/);
});

test("effect results show the base tile and step prices", async () => {
  const ui = loadUi();
  const output = await effectResultFor(ui, ["motor_oil"]);
  const list = descendantsOf(output).find((node) => node.tagName === "ol");
  assert.equal(list.className, "chips chips--ordered mix");
  assert.deepEqual(
    list.children.map((tile) => [
      tile.className,
      ...tile.children.map((part) => `${part.className}=${part.textContent}`),
    ]),
    [
      ["mix__item mix__item--base", "mix__step=Base", "mix__name=OG Kush"],
      ["mix__item", "mix__step=1", "mix__name=Motor Oil", "mix__price=$1.00"],
    ],
  );
});

test("effect results use the shared Mix, Effects and modifier labels and drop the progress", async () => {
  const ui = loadUi();
  const output = await effectResultFor(ui, ["motor_oil"]);
  const all = descendantsOf(output);
  const card = all.find((node) => node.tagName === "article");
  const effects = descendantsOf(card).find(
    (node) => node.tagName === "ul" && node.className === "chips",
  ).children.length;
  assert.ok(effects > 0);
  const stats = card.children.find((node) => node.className === "stats");
  assert.deepEqual(
    [
      ...stats.children.map((stat) => stat.children[0].textContent),
      ...descendantsOf(card)
        .filter((node) => node.className === "chips-label")
        .map((node) => node.textContent),
    ],
    ["Profit", "Sell Price", "Ingredient Cost", "Modifier", "Mix", `Effects · ${effects}`],
  );
  const modifier = stats.children[3].children[1].textContent;
  assert.match(modifier, /^\d+\.\d{2}$/);
  assert.equal(
    all.filter((node) => ["progress", "status-block"].includes(node.className)).length,
    0,
    "a finished result holds no progress",
  );
});

test("Recipe match opens with Allow extras checked in the markup", () => {
  const html = fs.readFileSync(
    path.resolve(__dirname, "../../webapp/templates/index.html"),
    "utf8",
  );
  const inputs = html.match(/<input[^>]*name="effect_match_mode"[^>]*>/g);
  assert.equal(inputs.length, 2);
  const checked = inputs.filter((tag) => /\schecked(\s|\/|>)/.test(tag));
  assert.equal(checked.length, 1);
  assert.match(checked[0], /value="contains"/);
});

test("the Only these suggestion appears only for an Only these search without a result", async () => {
  async function run({ matchMode, status }) {
    const ui = loadUi();
    await openEffects(ui);
    setMatchMode(ui, matchMode);
    choose(ui, "calming");
    await ui.effectForm.listeners.submit(event());
    const worker = ui.workers[0];
    worker.emit({
      request_id: worker.sent[0].request_id,
      result: effectResult({
        matchMode,
        status,
        targets: ["calming"],
      }),
      type: "result",
    });
    return textOf(ui.elements["effect-result"]);
  }
  const suggestion = /“Only these” may be the reason.*“Allow extras”/s;
  assert.match(await run({ matchMode: "exact", status: "not_found" }), suggestion);
  assert.doesNotMatch(await run({ matchMode: "contains", status: "not_found" }), suggestion);
  const found = await run({ matchMode: "exact", status: "optimal" });
  assert.doesNotMatch(found, suggestion);
});
