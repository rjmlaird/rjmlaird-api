import { Hono } from "hono";
import { serveStatic } from "hono/serve-static";

// Routes
import system from "./routes/system";
import debug from "./routes/debug";
import webdav from "./routes/webdav";
import research from "./routes/research";
import cv from "./routes/cv";
import portfolio from "./routes/portfolio";
import contact from "./routes/contact";
import activities from "./routes/activities";
import general from "./routes/general";
import { aiApp } from "./routes/ai";
import { site } from "./routes/site";

const app = new Hono<{ Bindings: Env }>();

// Serve favicon as a static asset
app.get("/favicon.svg", async (c) => {
  const object = await c.env.CDN.get("favicon.svg");
  if (!object) return c.notFound();
  
  c.header("Content-Type", "image/svg+xml");
  return c.body(object.body);
});

// Route mounting
app.route("/system", system);
app.route("/debug", debug);
app.route("/webdav", webdav);
app.route("/v1/research", research);
app.route("/v1/cv", cv);
app.route("/v1/portfolio", portfolio);
app.route("/v1/contact", contact);
app.route("/v1/activities", activities);
app.route("/v1/general", general);
app.route("/v1/ai", aiApp);

// Mount the site routes (covers / and /openapi.json)
app.route("/", site);

app.notFound((c) => c.text("Not found", 404));

export default app;