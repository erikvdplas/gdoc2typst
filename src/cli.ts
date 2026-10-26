#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import {
  ensureAuthenticated,
  login,
  logout,
  type ClientOptions,
} from "./auth/oauth.js";
import { authStatus } from "./auth/token-store.js";
import { createAssetWriter } from "./convert/assets.js";
import { convertDocument, usesTabModules } from "./convert/document.js";
import { downloadImage } from "./google/download-image.js";
import { fetchDocument } from "./google/fetch-document.js";
import { parseDocumentId, sanitizeFilename } from "./util/doc-id.js";

function clientOpts(opts: {
  clientId?: string;
  clientSecret?: string;
  credentials?: string;
}): ClientOptions {
  return {
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    credentialsFile: opts.credentials,
  };
}

const program = new Command();

program
  .name("gdoc2typst")
  .description("Convert Google Docs to include-friendly Typst source files")
  .version("0.1.0");

const auth = program.command("auth").description("Manage Google OAuth credentials");

auth
  .command("login")
  .description("Sign in with Google and store credentials in the OS keychain")
  .option("--credentials <file>", "OAuth client JSON downloaded from Google Cloud")
  .option("--client-id <id>", "OAuth client id")
  .option("--client-secret <secret>", "OAuth client secret")
  .action(async (opts: { clientId?: string; clientSecret?: string; credentials?: string }) => {
    try {
      await login(clientOpts(opts));
      console.error("Signed in. Credentials stored in the OS keychain.");
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });

auth
  .command("status")
  .description("Show whether client credentials and tokens are stored")
  .action(async () => {
    const status = await authStatus();
    console.log(`client: ${status.hasClient ? "stored" : "missing"}`);
    console.log(`tokens: ${status.hasTokens ? "stored" : "missing"}`);
  });

auth
  .command("logout")
  .description("Remove stored OAuth tokens from the keychain")
  .option("--forget-client", "Also remove stored client id and secret")
  .action(async (opts: { forgetClient?: boolean }) => {
    await logout(Boolean(opts.forgetClient));
    console.error(
      opts.forgetClient
        ? "Removed stored tokens and client credentials."
        : "Removed stored tokens.",
    );
  });

program
  .command("convert")
  .description("Fetch a Google Doc and write Typst markup")
  .argument("<doc>", "Google Docs URL or document id")
  .option("-o, --output <file>", "Output .typ path")
  .option("--assets <dir>", "Directory for downloaded images")
  .option("--tabs <dir>", "Directory for per-tab modules (default: tabs)")
  .option("--credentials <file>", "OAuth client JSON downloaded from Google Cloud")
  .option("--client-id <id>", "OAuth client id")
  .option("--client-secret <secret>", "OAuth client secret")
  .action(
    async (
      doc: string,
      opts: {
        output?: string;
        assets?: string;
        tabs?: string;
        clientId?: string;
        clientSecret?: string;
        credentials?: string;
      },
    ) => {
      try {
        const documentId = parseDocumentId(doc);
        const authClient = await ensureAuthenticated(clientOpts(opts));
        const document = await fetchDocument(authClient, documentId);

        const title = document.title || "document";
        const defaultName = `${sanitizeFilename(title)}.typ`;
        const outputPath = path.resolve(opts.output ?? defaultName);
        const outputDir = path.dirname(outputPath);
        const splitTabs = usesTabModules(document);
        const tabsDir = path.resolve(opts.tabs ?? path.join(outputDir, "tabs"));
        const tabsIncludeDir = splitTabs
          ? path.relative(outputDir, tabsDir).split(path.sep).join("/")
          : undefined;
        const assetsDir = path.resolve(
          opts.assets ??
          path.join(
            outputDir,
            `${path.basename(outputPath, path.extname(outputPath))}-assets`,
          ),
        );
        // Image paths are resolved from the file that contains them.
        const assetReference = splitTabs
          ? path.join(tabsDir, "module.typ")
          : outputPath;

        const assets = createAssetWriter(assetReference, assetsDir);
        const { typst, tabs, warnings } = await convertDocument(document, {
          assets,
          tabsDir: tabsIncludeDir,
          downloadImage: async (contentUri) => {
            const image = await downloadImage(authClient, contentUri);
            return { bytes: image.bytes, extension: image.extension };
          },
        });

        await fs.mkdir(outputDir, { recursive: true });
        if (tabs.length > 0) {
          await fs.mkdir(tabsDir, { recursive: true });
          for (const tab of tabs) {
            await fs.writeFile(path.join(tabsDir, tab.filename), tab.typst, "utf8");
          }
        }
        await fs.writeFile(outputPath, typst, "utf8");

        for (const warning of warnings) {
          console.error(`warning: ${warning.message}`);
        }
        console.error(`Wrote ${outputPath}`);
      } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
    },
  );

await program.parseAsync(process.argv);
