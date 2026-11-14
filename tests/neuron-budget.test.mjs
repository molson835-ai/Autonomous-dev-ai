import test from "node:test";
import assert from "node:assert/strict";
import { estimateGlm47FlashNeurons, MINIMUM_CALL_RESERVATION_NEURONS } from "../agent/lib/neuron-budget.mjs";
test("GLM-4.7-Flash estimate uses published rates and a safety margin",()=>{assert.equal(estimateGlm47FlashNeurons(0,0),MINIMUM_CALL_RESERVATION_NEURONS);assert.equal(estimateGlm47FlashNeurons(16384,1024),200);assert.equal(estimateGlm47FlashNeurons(undefined,10),200);assert.ok(estimateGlm47FlashNeurons(100000,5000)>200);});
