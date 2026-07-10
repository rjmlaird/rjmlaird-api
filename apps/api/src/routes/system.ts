import { Hono } from "hono";

const system = new Hono<{ Bindings: Env }>();

const OPENAPI_DESCRIPTION =
  "GitHub-powered CV + portfolio + contact + research + WebDAV API";

const cvCollections = [
  "awards",
  "certifications",
  "credly",
  "education",
  "experience",
  "languages",
  "memberships",
  "profile",
  "skills",
  "teaching",
  "tools",
  "volunteering",
] as const;

system.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "rjmlaird-api",
    timestamp: new Date().toISOString(),
  })
);

system.get("/openapi.json", (c) =>
  c.json({
    openapi: "3.1.0",
    info: {
      title: "rjmlaird API",
      version: "1.0.0",
      description: OPENAPI_DESCRIPTION,
    },
    servers: [
      {
        url: "https://api.rjmlaird.co.uk",
      },
    ],
    tags: [
      { name: "System", description: "Health and API metadata" },
      { name: "Debug", description: "Debug endpoints" },
      { name: "CV", description: "Profile, experience, skills, and other CV collections" },
      { name: "Portfolio", description: "Portfolio collections" },
      { name: "Contact", description: "Contact details and social profiles" },
      { name: "Activities", description: "Events, events attending, and talks" },
      { name: "General", description: "Organisations and UN countries" },
      { name: "Research", description: "Research API endpoints" },
      { name: "WebDAV", description: "WebDAV access" },
      { name: "AI", description: "Grounded AI assistant" },
    ],
    paths: {
      "/v1/cv/section/{section}": {
        get: {
          tags: ["CV"],
          parameters: [
            {
              name: "section",
              in: "path",
              required: true,
              schema: { type: "string", enum: cvCollections },
            },
          ],
        },
      },
      "/v1/portfolio/section/{section}": {
        get: {
          tags: ["Portfolio"],
          parameters: [{ name: "section", in: "path", required: true, schema: { type: "string" } }],
        },
      },
      "/v1/contact/section/{section}": {
        get: {
          tags: ["Contact"],
          parameters: [
            {
              name: "section",
              in: "path",
              required: true,
              schema: { type: "string", enum: ["contact", "socials"] },
            },
          ],
        },
      },
      "/v1/activities/section/{section}": {
        get: {
          tags: ["Activities"],
          parameters: [
            {
              name: "section",
              in: "path",
              required: true,
              schema: { type: "string", enum: ["events", "eventsAttending", "talks"] },
            },
          ],
        },
      },
      "/v1/general/section/{section}": {
        get: {
          tags: ["General"],
          parameters: [
            {
              name: "section",
              in: "path",
              required: true,
              schema: { type: "string", enum: ["organisations", "unCountries"] },
            },
          ],
        },
      },
    },
  })
);

export default system;
