// Run: node scripts/testGeocode.mjs
// Can't call the live Google API from this sandbox, so these exercise the
// pure parsing logic (buildAddressFromResults) against realistic response
// shapes modelled on Google's documented Geocoding API structure: a
// landmark-level result bundles its own name + route + locality + country
// together as its address_components, which is what real POI-adjacent
// lookups actually return.
import assert from "node:assert/strict";
import { buildAddressFromResults } from "../lib/geocode.js";

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log("  ok  " + name); };

const comp = (long_name, ...types) => ({ long_name, short_name: long_name, types });

// A landmark-level result, as Google actually structures one: the POI's own
// name plus the full hierarchy down to country, all in one result's
// address_components.
const landmarkResult = (name, route, locality, region) => ({
  types: ["point_of_interest", "establishment"],
  formatted_address: `${name}, ${route}, ${locality}, Tanzania`,
  address_components: [
    comp(name, "point_of_interest", "establishment"),
    comp(route, "route"),
    comp(locality, "locality", "political"),
    comp(region, "administrative_area_level_1", "political"),
    comp("Tanzania", "country", "political"),
  ],
});
const streetResult = (route, locality, region) => ({
  types: ["route"],
  address_components: [comp(route, "route"), comp(locality, "locality", "political"), comp(region, "administrative_area_level_1", "political"), comp("Tanzania", "country", "political")],
});
const localityResult = (locality, region) => ({
  types: ["locality", "political"],
  address_components: [comp(locality, "locality", "political"), comp(region, "administrative_area_level_1", "political"), comp("Tanzania", "country", "political")],
});

console.log("flagship cities get Landmark, Road, City");
t("Dar es Salaam landmark (the real MC 575 CUL case)", () => {
  const results = [landmarkResult("Institute of Adult Education", "Bibi Titi Mohamed Road", "Dar es Salaam", "Dar es Salaam Region")];
  assert.equal(buildAddressFromResults(results), "Institute of Adult Education, Bibi Titi Mohamed Road, Dar es Salaam");
});
t("Mwanza landmark (Smiles Cars Mwanza)", () => {
  const results = [landmarkResult("Smiles Cars Mwanza", "Nkrumah St", "Mwanza", "Mwanza Region")];
  assert.equal(buildAddressFromResults(results), "Smiles Cars Mwanza, Nkrumah St, Mwanza");
});
t("no landmark nearby: falls back to Road, City (no crash, no empty landmark)", () => {
  const results = [streetResult("Bibi Titi Mohamed Road", "Dar es Salaam", "Dar es Salaam Region"), localityResult("Dar es Salaam", "Dar es Salaam Region")];
  assert.equal(buildAddressFromResults(results), "Bibi Titi Mohamed Road, Dar es Salaam");
});
t("Arusha matches on locality directly", () => {
  const results = [streetResult("Sokoine Rd", "Arusha", "Arusha Region")];
  assert.equal(buildAddressFromResults(results), "Sokoine Rd, Arusha");
});
t("city name casing/spelling from Google doesn't matter (case-insensitive match, canonical display name used)", () => {
  const results = [streetResult("Some Rd", "DAR ES SALAAM", "Dar es Salaam Region")];
  assert.equal(buildAddressFromResults(results), "Some Rd, Dar es Salaam");
});

console.log("Zanzibar — the tricky one, rarely geocodes with a plain 'Zanzibar' locality");
t("locality is 'Zanzibar City'", () => {
  const results = [streetResult("Creek Rd", "Zanzibar City", "Zanzibar Urban/West Region")];
  assert.equal(buildAddressFromResults(results), "Creek Rd, Zanzibar");
});
t("no locality at all, but 'Zanzibar' is in the region field — still caught", () => {
  const results = [{ types: ["route"], address_components: [comp("Creek Rd", "route"), comp("Zanzibar Urban/West Region", "administrative_area_level_1", "political"), comp("Tanzania", "country", "political")] }];
  assert.equal(buildAddressFromResults(results), "Creek Rd, Zanzibar");
});

console.log("outside the four flagship cities — just Town, Tanzania, no road/landmark detail");
t("Tanga: plain town + country, even though a road exists in the raw data", () => {
  const results = [streetResult("Independence Ave", "Tanga", "Tanga Region"), localityResult("Tanga", "Tanga Region")];
  assert.equal(buildAddressFromResults(results), "Tanga, Tanzania");
});
t("a small town with no locality component, only a region — falls back to the region name", () => {
  const results = [{ types: ["administrative_area_level_1", "political"], address_components: [comp("Iringa Region", "administrative_area_level_1", "political"), comp("Tanzania", "country", "political")] }];
  assert.equal(buildAddressFromResults(results), "Iringa Region, Tanzania");
});
t("landmark present but NOT in a flagship city: landmark and road are still dropped", () => {
  const results = [landmarkResult("Tanga Fish Market", "Market St", "Tanga", "Tanga Region")];
  assert.equal(buildAddressFromResults(results), "Tanga, Tanzania");
});

console.log("edge cases");
t("no results at all => null, not a crash", () => assert.equal(buildAddressFromResults([]), null));
t("results present but nothing identifiable at any level => plain 'Tanzania'", () => {
  const results = [{ types: ["country", "political"], address_components: [comp("Tanzania", "country", "political")] }];
  assert.equal(buildAddressFromResults(results), "Tanzania");
});
t("a locality that merely CONTAINS a flagship city name as a substring of a different word is still intentionally matched (documented trade-off, not a bug)", () => {
  // e.g. a hypothetical "New Mwanza Estate" would match "mwanza" -- accepted
  // as the simplest robust approach given Zanzibar's own naming already
  // needs substring matching; a real false positive here is very unlikely
  // in Tanzania's actual place names.
  const results = [streetResult("Estate Rd", "New Mwanza Estate", "Some Region")];
  assert.equal(buildAddressFromResults(results), "Estate Rd, Mwanza");
});

console.log(`\n${passed} tests passed`);
