import { describe, expect, it } from "vitest";
import app from "../src/routes/bio";

describe("GET /v1/bio", () => {
  it("returns the core biography document", async () => {
    const response = await app.request("http://localhost/");

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.data).toMatchObject({
      id: "ryan-j-m-laird",
      displayName: "Ryan Laird",
    });

    expect(body.meta).toMatchObject({
      version: "1",
    });
  });

  it("returns allowlisted social profiles", async () => {
    const response = await app.request("http://localhost/profiles");

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.section).toBe("profiles");
    expect(Array.isArray(body.data.profiles)).toBe(true);

    for (const profile of body.data.profiles) {
      expect(profile).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          label: expect.any(String),
          url: expect.any(String),
        }),
      );
    }
  });

  it("returns 404 for an unknown section", async () => {
    const response = await app.request("http://localhost/not-a-section");

    expect(response.status).toBe(404);

    const body = await response.json();

    expect(body.error).toBe("Not found");
    expect(body.allowed).toContain("profiles");
  });
});
