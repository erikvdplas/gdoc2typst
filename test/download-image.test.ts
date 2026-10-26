import { afterEach, describe, expect, it, vi } from "vitest";
import type { OAuth2Client } from "google-auth-library";
import { downloadImage } from "../src/google/download-image.js";

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

function jsonResponse(
  status: number,
  body: Buffer | string,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, { status, headers });
}

describe("downloadImage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("downloads a pre-authorized content URI without an Authorization header", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, PNG, { "content-type": "image/png" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const getAccessToken = vi.fn();

    const image = await downloadImage(
      { getAccessToken } as unknown as OAuth2Client,
      "https://lh3.googleusercontent.com/docsz/example",
    );

    expect(image.extension).toBe("png");
    expect(image.bytes.subarray(0, 4)).toEqual(PNG.subarray(0, 4));
    expect(getAccessToken).not.toHaveBeenCalled();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toBeUndefined();
  });

  it("retries with a bearer token and keeps it across redirects", async () => {
    const calls: Array<{ url: string; authorization?: string }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url,
        authorization: headers.get("authorization") ?? undefined,
      });
      if (calls.length === 1) {
        return jsonResponse(400, "Invalid request");
      }
      if (url.endsWith("/start")) {
        return jsonResponse(302, "", {
          location: "https://lh3.googleusercontent.com/final.png",
        });
      }
      return jsonResponse(200, PNG, { "content-type": "image/png" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const image = await downloadImage(
      {
        getAccessToken: async () => ({ token: "ya29.test" }),
      } as unknown as OAuth2Client,
      "https://docs.google.com/start",
    );

    expect(image.bytes[0]).toBe(0x89);
    expect(calls[0]?.authorization).toBeUndefined();
    expect(calls[1]).toEqual({
      url: "https://docs.google.com/start",
      authorization: "Bearer ya29.test",
    });
    expect(calls[2]).toEqual({
      url: "https://lh3.googleusercontent.com/final.png",
      authorization: "Bearer ya29.test",
    });
  });

  it("rejects an HTML page returned with status 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(200, "<html>sign in</html>", { "content-type": "text/html" }),
      ),
    );

    await expect(
      downloadImage(
        {
          getAccessToken: async () => ({ token: "ya29.test" }),
        } as unknown as OAuth2Client,
        "https://lh3.googleusercontent.com/docsz/example",
      ),
    ).rejects.toThrow(/text\/html/);
  });
});
