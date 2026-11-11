let credentials: { username: string; password: string } | null = null;

/** Credentials live only in this browser tab's memory and are never persisted. */
export function setAgentCredentials(next: { username: string; password: string }) {
  credentials = next;
}

export function clearAgentCredentials() {
  credentials = null;
}

export async function getAgentAuthHeaders(): Promise<Record<string, string>> {
  if (!credentials) return {};

  const bytes = new TextEncoder().encode(
    `${credentials.username}:${credentials.password}`,
  );
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return { authorization: `Basic ${btoa(binary)}` };
}
