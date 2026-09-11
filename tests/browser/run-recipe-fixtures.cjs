"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { evaluateRecipe } = require(
  path.resolve(__dirname, "../../webapp/static/js/search-engine.js"),
);

const input = JSON.parse(fs.readFileSync(0, "utf8"));
if (!input || typeof input !== "object" || !Array.isArray(input.fixtures)) {
  throw new TypeError("stdin must contain a catalog and fixtures array");
}
process.stdout.write(
  JSON.stringify(input.fixtures.map((request) => evaluateRecipe(input.catalog, request))),
);
