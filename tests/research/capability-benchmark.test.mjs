import assert from "node:assert/strict";
import test from "node:test";
import { buildBenchmarkReport } from "../../agent/evaluation/capability-benchmark.ts";

const baseline={runId:"baseline-1",recordedAt:"2026-11-01T12:00:00.000Z",cases:[
 {id:"research.source-check",dimension:"research",status:"failed",evidenceRef:"ci://run/1"},
 {id:"coding.typecheck",dimension:"coding",status:"passed",evidenceRef:"ci://run/1"},
 {id:"memory.recall",dimension:"memory",status:"passed",evidenceRef:"review://1"},
]};
const current={runId:"current-2",recordedAt:"2026-11-15T12:00:00.000Z",cases:[
 {id:"research.source-check",dimension:"research",status:"passed",evidenceRef:"ci://run/2"},
 {id:"coding.typecheck",dimension:"coding",status:"failed",evidenceRef:"ci://run/2"},
 {id:"memory.recall",dimension:"memory",status:"passed",evidenceRef:"review://2"},
 {id:"business.opportunity",dimension:"business",status:"blocked",evidenceRef:""},
]};
test("reports per-dimension outcomes, improvements, regressions, and blocked cases",()=>{
 const report=buildBenchmarkReport(current,baseline);
 assert.equal(report.totalCases,4);
 assert.equal(report.passed,2);
 assert.equal(report.failed,1);
 assert.equal(report.blocked,1);
 assert.equal(report.passRatePercent,67);
 assert.deepEqual(report.improvements,["research.source-check"]);
 assert.deepEqual(report.regressions,["coding.typecheck"]);
 assert.equal(report.dimensions.find(x=>x.dimension==="business").passRatePercent,null);
});
test("blocked tests are excluded from pass rate but remain visible",()=>{
 const report=buildBenchmarkReport({runId:"blocked",recordedAt:"2026-11-15T12:00:00Z",cases:[{id:"x",dimension:"autonomy",status:"blocked",evidenceRef:""}]});
 assert.equal(report.passRatePercent,null);
 assert.equal(report.blocked,1);
});
test("does not infer improvements for missing or changed-dimension tests",()=>{
 const report=buildBenchmarkReport({runId:"new",recordedAt:"2026-11-15T12:00:00Z",cases:[{id:"research.source-check",dimension:"reasoning",status:"passed",evidenceRef:"test://new"}]},baseline);
 assert.deepEqual(report.improvements,[]);
 assert.deepEqual(report.regressions,[]);
});
test("rejects duplicate IDs, missing evidence, and identical run IDs",()=>{
 assert.throws(()=>buildBenchmarkReport({...current,cases:[current.cases[0],current.cases[0]]}),/unique/);
 assert.throws(()=>buildBenchmarkReport({...current,cases:[{...current.cases[0],evidenceRef:""}]}),/evidence reference/);
 assert.throws(()=>buildBenchmarkReport(current,{...baseline,runId:current.runId}),/different runIds/);
});
test("rejects malformed timestamps and out-of-range snapshots",()=>{
 assert.throws(()=>buildBenchmarkReport({...current,recordedAt:"not-a-date"}),/valid date-time/);
 assert.throws(()=>buildBenchmarkReport({...current,cases:[]}),/1 to 500/);
});
