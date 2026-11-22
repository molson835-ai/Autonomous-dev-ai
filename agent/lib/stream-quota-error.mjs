/**
 * Handle failures raised after a streaming provider response has been returned.
 * A quota rejection must open the shared circuit and retain its reservation:
 * settling it would hide the provider exhaustion from the shared preflight.
 * Other stream failures settle conservatively, without masking the original error.
 */
export async function handleStreamReadFailure({
  error,
  reservationId,
  settle,
  circuit,
  isQuotaError,
  nonRetryableQuotaError,
}) {
  if (isQuotaError(error)) {
    try { await circuit(reservationId); } catch { /* Retain reservation; fail closed. */ }
    throw nonRetryableQuotaError(error);
  }

  try { await settle(reservationId); } catch { /* Retain reservation; preserve original failure. */ }
  throw error;
}
