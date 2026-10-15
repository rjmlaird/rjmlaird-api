import { describe, expect, it } from "vitest";
import app from "../src/routes/bio";

type Profile = {
  id: string;
  label: string;
  url: string;
  type?: string;
};

type BioResponse = {
  data: {
    id: string;
    displayName: string;
  };
  meta: {
    version: string;
    updatedAt: string;
  };
};

type ProfilesResponse = {
  section: "profiles";
  data: {
    profiles: Profile[];
    related: {
      socials: string;
    };
  };
  meta: {
    version: string;
    updatedAt: string;
  };
};

type NotFoundResponse = {
  error: string;
  section: string;
  allowed: string[];
};

describe("GET /v1/bio", () => {
  it("returns the core biography document", async () => {
    const response = await app.request("http://localhost/");
    expect(response.status).toBe(200);

    const body = (await response.json()) as BioResponse;

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

    const body = (await response.json()) as ProfilesResponse;

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

    const body = (await response.json()) as NotFoundResponse;

    expect(body.error).toBe("Not found");
    expect(body.section).toBe("not-a-section");
    expect(body.allowed).toContain("profiles");
  });
});
