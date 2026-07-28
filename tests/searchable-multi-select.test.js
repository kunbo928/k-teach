import assert from "node:assert/strict";
import test from "node:test";

import {
  filterMultiSelectChoices,
  initiallySelectedValues,
} from "../dist/searchable-multi-select.js";

const choices = [
  { name: "Claude Code", value: "claude" },
  { name: "Codex", value: "codex", detected: true, preSelected: true },
  { name: "GitHub Copilot", value: "github-copilot" },
];

test("searchable Agent selection preselects detected tools", () => {
  assert.deepEqual(initiallySelectedValues(choices), ["codex"]);
});

test("searchable Agent selection filters by display name or tool ID", () => {
  assert.deepEqual(
    filterMultiSelectChoices(choices, "copilot").map((choice) => choice.value),
    ["github-copilot"],
  );
  assert.deepEqual(
    filterMultiSelectChoices(choices, "CLAUDE").map((choice) => choice.value),
    ["claude"],
  );
});
