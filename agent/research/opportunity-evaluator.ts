export interface OpportunitySignals {
  name: string;
  description: string;
  demandEvidence: number;
  competition: number;
  startupCostUsd: number;
  daysToFirstSale: number;
  grossMarginPercent: number;
  executionRisk: number;
  evidenceStrength: number;
  evidenceRefs: string[];
}
export interface OpportunityEvaluation extends OpportunitySignals {
  score: number;
  confidence: "low" | "medium" | "high";
  decision: "investigate" | "small_test" | "deprioritize";
  strengths: string[];
  concerns: string[];
  nextExperiment: string;
}
const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));
const inverse=(n:number)=>5-n;
/** Deterministic triage only. Scores are heuristics, not forecasts or guarantees. */
export function evaluateOpportunity(input: OpportunitySignals): OpportunityEvaluation {
  if (!input || typeof input.name!=="string" || !input.name.trim() || input.name.length>160) throw new Error("Opportunity name is required (max 160 characters)");
  if (typeof input.description!=="string" || input.description.length>1200) throw new Error("Description must be text (max 1200 characters)");
  const scales=[input.demandEvidence,input.competition,input.executionRisk,input.evidenceStrength];
  if (scales.some(v=>!Number.isFinite(v)||v<0||v>5)) throw new Error("Demand, competition, execution risk, and evidence strength must be scores from 0 to 5");
  if (!Number.isFinite(input.startupCostUsd)||input.startupCostUsd<0||input.startupCostUsd>1_000_000) throw new Error("Startup cost must be between $0 and $1,000,000");
  if (!Number.isFinite(input.daysToFirstSale)||input.daysToFirstSale<0||input.daysToFirstSale>3650) throw new Error("Days to first sale must be between 0 and 3650");
  if (!Number.isFinite(input.grossMarginPercent)||input.grossMarginPercent<0||input.grossMarginPercent>100) throw new Error("Gross margin must be between 0 and 100 percent");
  if (!Array.isArray(input.evidenceRefs)||input.evidenceRefs.length>10||!input.evidenceRefs.every(v=>typeof v==="string"&&v.trim().length>0&&v.trim().length<=500)) throw new Error("Provide at most 10 non-empty, bounded evidence references");
  const distinctEvidenceRefs = new Set(input.evidenceRefs.map(ref=>ref.trim()));
  if (distinctEvidenceRefs.size !== input.evidenceRefs.length) throw new Error("Evidence references must be distinct; duplicate references do not count as independent evidence");
  const costScore=5-5*Math.log1p(input.startupCostUsd)/Math.log1p(1000);
  const speedScore=5-5*Math.log1p(input.daysToFirstSale)/Math.log1p(90);
  const marginScore=input.grossMarginPercent/20;
  const raw=20*input.demandEvidence/5+10*inverse(input.competition)/5+15*clamp(costScore,0,5)/5+15*clamp(speedScore,0,5)/5+15*marginScore/5+15*inverse(input.executionRisk)/5+10*input.evidenceStrength/5;
  const score=Math.round(clamp(raw,0,100));
  const confidence=distinctEvidenceRefs.size>=3&&input.evidenceStrength>=4?"high":distinctEvidenceRefs.size>=1&&input.evidenceStrength>=2?"medium":"low";
  const strengths:string[]=[];
  const concerns:string[]=[];
  if(input.demandEvidence>=4) strengths.push("Strong demand signal");
  if(input.grossMarginPercent>=50) strengths.push("Potentially healthy gross margin");
  if(input.startupCostUsd<=50) strengths.push("Low cash requirement");
  if(input.daysToFirstSale<=14) strengths.push("Short path to first sale");
  if(input.competition>=4) concerns.push("Crowded competitive landscape");
  if(input.executionRisk>=4) concerns.push("High execution or delivery risk");
  if(input.evidenceStrength<3||distinctEvidenceRefs.size<2) concerns.push("Insufficient independent evidence; validate before acting");
  if(input.startupCostUsd>0) concerns.push("Any spending remains blocked until cleared EVE revenue and exact owner approval");
  const decision=score>=70&&confidence!=="low"&&input.startupCostUsd===0?"small_test":score>=45?"investigate":"deprioritize";
  const nextExperiment=confidence==="low"?"Collect at least two independent, dated sources and verify the demand signal before ranking this opportunity.":input.startupCostUsd===0?"Run a no-cost validation: inspect competitor offers, identify a specific underserved buyer, and test interest privately without outreach or commitments.":"First redesign as a zero-cost validation; do not buy inventory, subscribe, advertise, or commit funds.";
  return {...input,score,confidence,decision,strengths,concerns,nextExperiment};
}
