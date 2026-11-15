"use strict";

// Checks the self-hosted Barlow files in webapp/static/fonts/ and their licence.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const fontsDir = path.join(root, "webapp/static/fonts");
const fontFiles = ["barlow-latin-700-normal.woff2", "barlow-latin-800-normal.woff2"];

test("both Barlow files exist and are woff2", () => {
  for (const name of fontFiles) {
    const data = fs.readFileSync(path.join(fontsDir, name));
    assert.equal(data.subarray(0, 4).toString("latin1"), "wOF2", name);
  }
});

test("OFL.txt contains the licence title", () => {
  const text = fs.readFileSync(path.join(fontsDir, "OFL.txt"), "utf8");
  assert.ok(text.includes("SIL OPEN FONT LICENSE Version 1.1"));
});

test("README.md names the source package", () => {
  const text = fs.readFileSync(path.join(fontsDir, "README.md"), "utf8");
  assert.ok(text.includes("@fontsource/barlow"));
});

test("the fonts folder holds only the four expected files", () => {
  assert.deepEqual(fs.readdirSync(fontsDir).sort(), [...fontFiles, "OFL.txt", "README.md"].sort());
});
