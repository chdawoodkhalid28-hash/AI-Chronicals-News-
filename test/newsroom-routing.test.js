import test from "node:test";
import assert from "node:assert/strict";
import {routeCandidate,routeCandidates,DEPARTMENTS} from "../lib/newsroom-routing.js";
test("routes by keywords but always sends to research and verification",()=>{const row=routeCandidate({title:"Pakistan cotton farmers face flood damage",status:"candidate_unverified"});assert.ok(row.departmentTargets.includes("agriculture-rural"));assert.ok(row.departmentTargets.includes("research"));assert.ok(row.departmentTargets.includes("verification"));assert.equal(row.routingStatus,"suggested_only");});
test("unmatched candidate stays with assignment desk",()=>{const row=routeCandidate({title:"Unexpected headline"});assert.equal(row.departmentTargets[2],"assignment-desk");});
test("routing catalogue has 26 departments",()=>assert.equal(DEPARTMENTS.length,26));
