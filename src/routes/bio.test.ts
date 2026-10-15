import { describe, expect, it } from "vitest";
import app from "../src/routes/bio";
import bio from "../src/data/bio.json";

// ASSUMPTION: vitest, and Hono's app.request() works against the sub-app as in the CV tests.
const get = async (path: string) => {
  const res = await app.request(path);
  return { res, body: (await res.json()) as any };
};

const PRIVATE_KEYS = ["email", "phone", "address", "calendar", "crm", "booking"];
const keysDeep = (v: unknown): string[] =>
  v && typeof v === "object"
    ? Object.entries(v).flatMap(([k, x]) => [k.toLowerCase(), ...keysDeep(x)])
    : [];

describe("/v1/bio", () => {
  it("returns the aggregate bio", async () => {
    const { res, body } = await get("/");
    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ id: bio.id, displayName: "Ryan Laird" });
    expect(body.data.related).toEqual({ cv: "/v1/cv", portfolio: "/v1/portfolio", contact: "/v1/contact" });
    expect(body.meta).toEqual({ version: "1", updatedAt: bio.updatedAt });
  });

  it("returns only the short bio shape", async () => {
    const { body } = await get("/short");
    expect(Object.keys(body.data).sort()).toEqual(["displayName", "shortBio"]);
  });

  it("returns the approved summary", async () => {
    const { body } = await get("/summary");
    expect(body.data.summary).toBe(bio.summary);
  });

  it("returns roles without employment history", async () => {
    const { body } = await get("/roles");
    const roleKeys = body.data.roles.flatMap((r: object) => Object.keys(r));
    expect(roleKeys.every((k: string) => ["title", "organisation", "current"].includes(k))).toBe(true);
  });

  it("returns the focus list", async () => {
    const { body } = await get("/focus");
    expect(body.data.focus).toEqual(bio.focus);
  });

  it("returns allowlisted public profiles only", async () => {
    const { body } = await get("/profiles");
    for (const p of body.data.profiles) {
      expect(bio.profileIds).toContain(p.id);
      expect(p.url).toMatch(/^https:\/\//);
    }
  });

  it("returns approved https links", async () => {
    const { body } = await get("/links");
    expect(body.data.links.length).toBeGreaterThan(0);
    for (const l of body.data.links) expect(l.url).toMatch(/^https:\/\//);
  });

  it("does not expose private contact fields", async () => {
    const { body } = await get("/contact");
    const keys = keysDeep(body.data);
    for (const k of PRIVATE_KEYS) expect(keys).not.toContain(k);
    expect(body.data.related.contact).toBe("/v1/contact");
  });

  it("uses the normal 404 for unknown paths", async () => {
    const { res, body } = await get("/nope");
    expect(res.status).toBe(404);
    expect(body.error).toBe("Not found");
  });
});
