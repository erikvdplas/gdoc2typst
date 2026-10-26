import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clientFromCredentialsJson,
  loadClientFromFile,
  resolveClient,
} from "../src/auth/oauth.js";

const desktopClient = {
  installed: {
    client_id: "desktop-id.apps.googleusercontent.com",
    client_secret: "desktop-secret",
    redirect_uris: ["http://localhost"],
  },
};

describe("clientFromCredentialsJson", () => {
  it("reads a Desktop client download", () => {
    expect(clientFromCredentialsJson(desktopClient)).toEqual({
      clientId: "desktop-id.apps.googleusercontent.com",
      clientSecret: "desktop-secret",
    });
  });

  it("reads a web client download", () => {
    expect(
      clientFromCredentialsJson({
        web: { client_id: "web-id", client_secret: "web-secret" },
      }),
    ).toEqual({ clientId: "web-id", clientSecret: "web-secret" });
  });

  it("rejects a service account key", () => {
    expect(() =>
      clientFromCredentialsJson({
        type: "service_account",
        client_email: "bot@example.iam.gserviceaccount.com",
        private_key: "-----BEGIN PRIVATE KEY-----\n",
      }),
    ).toThrow(/service account/i);
  });

  it("rejects JSON that is not an OAuth client", () => {
    expect(() => clientFromCredentialsJson({ project_id: "x" })).toThrow(
      /client_id/,
    );
  });
});

describe("loadClientFromFile and resolveClient", () => {
  const previousEnv = {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_OAUTH_CREDENTIALS: process.env.GOOGLE_OAUTH_CREDENTIALS,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("loads a credentials file from disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gdoc2typst-"));
    const file = join(dir, "client_secret.json");
    await writeFile(file, JSON.stringify(desktopClient));

    await expect(loadClientFromFile(file)).resolves.toEqual({
      clientId: "desktop-id.apps.googleusercontent.com",
      clientSecret: "desktop-secret",
    });
  });

  it("prefers --credentials over environment variables", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    const dir = await mkdtemp(join(tmpdir(), "gdoc2typst-"));
    const file = join(dir, "client.json");
    await writeFile(file, JSON.stringify(desktopClient));
    process.env.GOOGLE_OAUTH_CREDENTIALS = file;
    process.env.GOOGLE_CLIENT_ID = "env-id";
    process.env.GOOGLE_CLIENT_SECRET = "env-secret";

    await expect(
      resolveClient({ credentialsFile: file }),
    ).resolves.toMatchObject({ clientId: "desktop-id.apps.googleusercontent.com" });

    await expect(resolveClient()).resolves.toMatchObject({
      clientId: "env-id",
    });

    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    await expect(resolveClient()).resolves.toMatchObject({
      clientId: "desktop-id.apps.googleusercontent.com",
    });
  });

  it("prefers explicit id and secret over the credentials file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gdoc2typst-"));
    const file = join(dir, "client.json");
    await writeFile(file, JSON.stringify(desktopClient));

    await expect(
      resolveClient({
        clientId: "flag-id",
        clientSecret: "flag-secret",
        credentialsFile: file,
      }),
    ).resolves.toEqual({ clientId: "flag-id", clientSecret: "flag-secret" });
  });
});
