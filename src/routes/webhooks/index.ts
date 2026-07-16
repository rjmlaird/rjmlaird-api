import { Hono } from "hono";
import cal from "./cal";

const app = new Hono();

// This maps to /v1/webhooks/cal
app.route("/cal", cal);

// Example of how to add another webhook in the future:
// app.route("/github", github);

export default app;