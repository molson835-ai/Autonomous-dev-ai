export declare function memoryFailureMessage(status: number, payload: unknown): string;

export declare function memoryFailureDiagnostic(
  status: number,
  payload: unknown,
  path: string,
): {
  name: string;
  message: string;
  status: number;
  category: "quota_reservation" | "quota_settlement" | "quota_circuit" | "quota" | "memory";
  reason_code: string;
};
