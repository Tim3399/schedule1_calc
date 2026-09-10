"use strict";

const fs = require("node:fs");
const path = require("node:path");

const enginePath = path.resolve(__dirname, "../../webapp/static/js/search-engine.js");
if (!fs.existsSync(enginePath)) {
  throw new Error(`Browser search engine is missing: ${enginePath}`);
}
const { search } = require(enginePath);

function stripTiming(value) {
  if (Array.isArray(value)) return value.map(stripTiming);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "elapsed_seconds")
        .map(([key, child]) => [key, stripTiming(child)]),
    );
  }
  return value;
}

function runFixture(catalog, fixture) {
  const options = { ...(fixture.options || {}) };
  let completedPhaseReached = false;
  if (fixture.clock_advance_on_complete === true) {
    options.now = () => (completedPhaseReached ? 1000 : 0);
    options.onProgress = (progress) => {
      if (progress.phase === "complete") completedPhaseReached = true;
    };
  }
  if (fixture.now_values !== undefined) {
    if (fixture.clock_advance_on_complete === true) {
      throw new TypeError("clock fixtures must use only one clock source");
    }
    const values = fixture.now_values[Symbol.iterator]();
    let last;
    options.now = () => {
      const next = values.next();
      if (!next.done) last = next.value;
      if (last === undefined) throw new Error("now_values must not be empty");
      return last;
    };
  }
  try {
    return { ok: true, result: stripTiming(search(catalog, fixture.request, options)) };
  } catch (error) {
    return {
      ok: false,
      error: {
        name: error?.name,
        reason: error?.reason,
        message: error?.message,
        exposes_winners: Boolean(error?.best_modifier || error?.best_profit),
        completed_phase_reached: completedPhaseReached,
      },
    };
  }
}

const input = JSON.parse(fs.readFileSync(0, "utf8"));
if (!input || typeof input !== "object" || !Array.isArray(input.fixtures)) {
  throw new TypeError("stdin must contain a catalog and fixtures array");
}
process.stdout.write(
  JSON.stringify(input.fixtures.map((fixture) => runFixture(input.catalog, fixture))),
);
