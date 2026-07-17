import { Hono } from "hono";
import { json } from "../lib/jsonResponse";
import { z } from "zod";
import socialsData from "../data/socials.json";

// 1. Schema Definition
export const socialSchema = z.object({
  key: z.string(),
  name: z.string(),
  url: z.string().url(),
  icon: z.string(),
  label: z.string(),
  username: z.string(),
  type: z.string(),
});

// 2. Data Validation
const socials = z.array(socialSchema).parse(socialsData);

const contactData = {
  socials,
} as const;

// 3. Hono App Setup
const app = new Hono<{ Bindings: Env }>();

// This route handles /socials (assuming the app is mounted at /api)
app.get("/socials", (c) => {
  return json({ 
    section: "socials", 
    data: contactData.socials 
  });
});

// Optional: Fallback for dynamic collections if you add more later
app.get("/:collection", (c) => {
  const collection = c.req.param("collection");
  
  if (collection === "socials") {
    return json({ section: "socials", data: contactData.socials });
  }

  return json({ error: "Not found", collection }, 404);
});

export default app;