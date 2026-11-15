import assert from "node:assert/strict";
import test from "node:test";
import { evaluateOpportunity } from "../../agent/research/opportunity-evaluator.ts";

const base={name:"Niche replacement parts guide",description:"A no-cost digital guide solving a recurring buyer problem.",demandEvidence:4,competition:2,startupCostUsd:0,daysToFirstSale:10,grossMarginPercent:85,executionRisk:1,evidenceStrength:4,evidenceRefs:["https://example.com/source-a","https://example.org/source-b","https://example.net/source-c"]};

test("scores a strong zero-cost opportunity and proposes a reversible test",()=>{
 const result=evaluateOpportunity(base);
 assert.ok(result.score>=70 && result.score<=100);
 assert.equal(result.confidence,"high");
 assert.equal(result.decision,"small_test");
 assert.match(result.nextExperiment,/no-cost validation/);
});
test("weak evidence lowers confidence and prevents small-test recommendation",()=>{
 const result=evaluateOpportunity({...base,evidenceStrength:1,evidenceRefs:[]});
 assert.equal(result.confidence,"low");
 assert.notEqual(result.decision,"small_test");
 assert.match(result.concerns.join(" "),/independent evidence/);
});
test("startup cost and slow time reduce score; any cost is flagged",()=>{
 const free=evaluateOpportunity(base);
 const costly=evaluateOpportunity({...base,startupCostUsd:500,daysToFirstSale:180});
 assert.ok(costly.score<free.score);
 assert.match(costly.concerns.join(" "),/owner approval/);
 assert.match(costly.nextExperiment,/zero-cost/);
});
test("competition and execution risk reduce score",()=>{
 const low=evaluateOpportunity(base);
 const high=evaluateOpportunity({...base,competition:5,executionRisk:5});
 assert.ok(high.score<low.score);
});
test("rejects out-of-range or malformed inputs",()=>{
 assert.throws(()=>evaluateOpportunity({...base,demandEvidence:6}),/scores from 0 to 5/);
 assert.throws(()=>evaluateOpportunity({...base,startupCostUsd:-1}),/Startup cost/);
 assert.throws(()=>evaluateOpportunity({...base,grossMarginPercent:101}),/Gross margin/);
 assert.throws(()=>evaluateOpportunity({...base,evidenceRefs:Array(11).fill("x")}),/evidence references/);
});
