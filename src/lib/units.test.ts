import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEmail, isEligible, isAllowedDomain } from "./email";
import { publicName, slugify, statusLabel, prettifyLocalPart } from "./format";
import { rangesOverlap } from "./time";

test("normalizeEmail lowercases, trims, strips plus-addressing", () => {
  assert.equal(normalizeEmail("  Ryan+Alt@UPenn.edu "), "ryan@upenn.edu");
  assert.equal(normalizeEmail("A.B+tag+more@wharton.upenn.edu"), "a.b@wharton.upenn.edu");
  assert.equal(normalizeEmail("plain@sas.upenn.edu"), "plain@sas.upenn.edu");
});

test("domain allowlist accepts Penn, rejects others", () => {
  assert.equal(isAllowedDomain("x@upenn.edu"), true);
  assert.equal(isAllowedDomain("x@wharton.upenn.edu"), true);
  assert.equal(isEligible("x@gmail.com"), false);
  assert.equal(isEligible("not-an-email"), false);
  assert.equal(isEligible("x@seas.upenn.edu"), true);
});

test("publicName is first name + last initial only (no PII leak)", () => {
  assert.equal(publicName("Ava Lopez"), "Ava L.");
  assert.equal(publicName("Diego San Martin"), "Diego M.");
  assert.equal(publicName("Cher"), "Cher");
});

test("slugify produces url-safe slugs", () => {
  assert.equal(slugify("4×100 Sprint Relay!"), "4-100-sprint-relay");
  assert.equal(slugify("  Trivia   Night  "), "trivia-night");
});

test("statusLabel maps event status to public label", () => {
  assert.equal(statusLabel("in_progress"), "in progress");
  assert.equal(statusLabel("complete"), "final");
  assert.equal(statusLabel("published"), "upcoming");
});

test("prettifyLocalPart humanizes an email local part", () => {
  assert.equal(prettifyLocalPart("casey.newman@seas.upenn.edu"), "Casey Newman");
});

test("rangesOverlap detects schedule conflicts", () => {
  const a0 = "2026-08-14T13:00:00Z";
  const a1 = "2026-08-14T14:00:00Z";
  assert.equal(rangesOverlap(a0, a1, "2026-08-14T13:30:00Z", "2026-08-14T14:30:00Z"), true);
  assert.equal(rangesOverlap(a0, a1, "2026-08-14T14:00:00Z", "2026-08-14T15:00:00Z"), false); // touching, not overlapping
  assert.equal(rangesOverlap(a0, a1, null, null), false);
});
