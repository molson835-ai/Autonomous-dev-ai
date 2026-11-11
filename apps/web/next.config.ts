import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {};

// The Next.js app is a peer under apps/web; the Eve agent is at the repo root.
export default withEve(nextConfig, { eveRoot: "../.." });
