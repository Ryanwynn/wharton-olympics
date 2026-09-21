import test from "node:test";
import assert from "node:assert/strict";
import { buildTeamName } from "./teamName";

test("single-team event gets the plain '<Cluster> <Event>' name", () => {
  assert.equal(buildTeamName("Dragons", "Rock Paper Scissors", false, []), "Dragons Rock Paper Scissors");
});

test("multi-team event numbers every team, lowest free number first", () => {
  assert.equal(buildTeamName("Lions", "Tug of War", true, []), "Lions Tug of War Team 1");
  assert.equal(buildTeamName("Lions", "Tug of War", true, ["Lions Tug of War Team 1"]), "Lions Tug of War Team 2");
  // A freed slot is reused rather than skipped past.
  assert.equal(
    buildTeamName("Lions", "Tug of War", true, ["Lions Tug of War Team 2", "Lions Tug of War Team 3"]),
    "Lions Tug of War Team 1"
  );
});

test("comparison against existing names is case-insensitive", () => {
  assert.equal(buildTeamName("Bees", "Chess", true, ["bees chess team 1"]), "Bees Chess Team 2");
});

test("a taken plain name falls back to a numbered one", () => {
  assert.equal(buildTeamName("Tigers", "Trivia", false, ["Tigers Trivia"]), "Tigers Trivia Team 1");
});

test("long event names are clipped so the result stays within 60 chars", () => {
  const name = buildTeamName("Dragons", "x".repeat(100), true, []);
  assert.ok(name.length <= 60);
  assert.ok(name.endsWith(" Team 1"));
});
