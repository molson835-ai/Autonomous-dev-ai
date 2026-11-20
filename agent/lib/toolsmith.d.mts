export interface ToolProposalField {
  name: string;
  type: "string" | "number" | "boolean";
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
}

export interface ToolProposal {
  name: string;
  description: string;
  purpose: string;
  capability: "pure";
  fields: ToolProposalField[];
}

export interface ToolProposalValidation {
  valid: boolean;
  errors: string[];
}

export interface GeneratedToolScaffold {
  generated: true;
  name: string;
  source: string;
  limits: {
    capability: "pure";
    filesystem: false;
    network: false;
    shell: false;
    secrets: false;
    persistence: false;
    automaticRegistration: false;
    automaticExecution: false;
  };
  nextSteps: string[];
}

export interface RejectedToolScaffold {
  generated: false;
  errors: string[];
}

export function validateToolProposal(proposal: unknown): ToolProposalValidation;
export function generateToolScaffold(
  proposal: ToolProposal
): GeneratedToolScaffold | RejectedToolScaffold;
