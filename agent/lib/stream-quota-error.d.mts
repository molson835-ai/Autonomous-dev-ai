export function handleStreamReadFailure(args: {
  error: unknown;
  reservationId: string;
  settle: (reservationId: string) => Promise<unknown>;
  circuit: (reservationId: string) => Promise<unknown>;
  isQuotaError: (error: unknown) => boolean;
  nonRetryableQuotaError: (error: unknown) => Error;
}): Promise<never>;
