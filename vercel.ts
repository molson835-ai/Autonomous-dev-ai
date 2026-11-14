import { withEve } from "eve/vercel";

export default await withEve({
  services: {
    web: {
      framework: "nextjs",
      root: "apps/web",
      buildCommand: "node ../../node_modules/next/dist/bin/next build",
    },
  },
  git: { deploymentEnabled: { "feat/eve-quota-resource-manager-2026-11-14": false } },
  routes: [
    {
      src: "^(.*)$",
      destination: { type: "service", service: "web" },
    },
  ],
});
