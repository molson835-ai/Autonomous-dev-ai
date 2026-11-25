import { getVercelOidcToken } from "@vercel/oidc";
import { Client } from "eve/client";
import { NextResponse } from "next/server";
import { getVerifiedOwnerLogin } from "@/lib/owner-github";
import { projectRuntimeCapabilities } from "@/lib/runtime-capabilities.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store", pragma: "no-cache" },
  });
}

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ reason_code: "runtime_capability_access_denied" }, 403);
  }

  const ownerLogin = await getVerifiedOwnerLogin();
  if (!ownerLogin) {
    return json({ reason_code: "owner_authentication_required" }, 401);
  }

  if (process.env.VERCEL_ENV !== "production") {
    return json({ reason_code: "production_environment_required" }, 409);
  }

  const deploymentHost = process.env.VERCEL_URL;
  if (!deploymentHost || !/^[a-z0-9.-]+$/i.test(deploymentHost)) {
    return json({ reason_code: "deployment_host_unavailable" }, 503);
  }

  try {
    const client = new Client({
      baseUrl: "https://" + deploymentHost,
      auth: {
        vercelOidc: {
          token: async () => await getVercelOidcToken(),
        },
      },
    });
    const info = await client.info({ signal: AbortSignal.timeout(8_000) });
    return json(projectRuntimeCapabilities(info, {
      checkedAt: new Date().toISOString(),
      environment: process.env.VERCEL_ENV,
    }));
  } catch {
    // Do not return upstream response bodies, headers, tokens, or server paths.
    return json({ reason_code: "agent_info_unavailable" }, 502);
  }
}
