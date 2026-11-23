import { DEMO_ON } from "@/lib/demo";

/**
 * The portal demo exists only while PORTAL_DEMO_ENABLED is exactly "true"; otherwise /portal/demo is a 404. It also
 * stays off in a build made with NEXT_PUBLIC_DEMO_DATA=1: that older presentation data (lib/demo.ts) is merged into
 * every record list at build time, and the portal demo must show only its own fictional fixtures.
 */
export const demoEnabled = () => process.env.PORTAL_DEMO_ENABLED === "true" && !DEMO_ON;
