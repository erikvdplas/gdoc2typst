# gdoc2typst

Convert a Google Doc into an include-friendly Typst source file. The tool copies text and approximate structure (headings, emphasis, lists, tables, figures, footnotes). It does **not** emit a Typst preamble or document-level `#set` rules, so the result can be pulled into another file with `#include`.

## Requirements

- Node.js 22+
- A Google Cloud project with the **Google Docs API** enabled
- An OAuth **Desktop** client (loopback `http://127.0.0.1` redirects)

## Google Cloud setup

1. Create or select a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **Google Docs API**.
3. Configure the OAuth consent screen (External or Internal). While the app is in Testing, only listed test users can sign in.
4. Create credentials → **OAuth client ID** → application type **Desktop app**.
5. Copy the client id and client secret.

Never commit the client secret. Pass it via flags or environment variables.

## Install

```bash
npm install
npm run build
npm link   # optional: expose `gdoc2typst` on your PATH
```

## Authenticate

```bash
export GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
export GOOGLE_CLIENT_SECRET="your-client-secret"

gdoc2typst auth login
# or:
gdoc2typst auth login --client-id "$GOOGLE_CLIENT_ID" --client-secret "$GOOGLE_CLIENT_SECRET"
```

This opens a browser for Google sign-in, then stores the client and refresh token in the OS keychain via `cross-keychain` (service `gdoc2typst`).

```bash
gdoc2typst auth status
gdoc2typst auth logout
gdoc2typst auth logout --forget-client
```

## Convert

```bash
gdoc2typst convert "https://docs.google.com/document/d/DOCUMENT_ID/edit"
gdoc2typst convert DOCUMENT_ID -o chapter.typ --assets chapter-assets
```

If no refresh token is stored, `convert` starts the same browser login as `auth login` and then continues.

Default output is `./<sanitized-title>.typ`. Images are saved under a sibling `<basename>-assets/` directory (or `--assets`). Image paths in the Typst are relative to the `.typ` file so `#include` resolution works.

Client credentials for `convert` resolve in this order: `--client-id` / `--client-secret`, then `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, then a client already stored in the keychain.

## What is converted

| Google Docs | Typst |
| --- | --- |
| Title / Heading 1–6 | `=` … `======` |
| Subtitle | Emphasized paragraph |
| Bold / italic / underline / strike | `*…*` / `_…_` / `#underline` / `#strike` |
| Links | `#link` |
| Lists | `-` / `+` |
| Tables | `#table` (including cell spans) |
| Images | `#image` / `#figure` |
| Footnotes | `#footnote` |
| Table of contents | `#outline()` |
| Horizontal rule | `#line(length: 100%)` |

Page geometry, numbering, language, fonts, colors, alignment, and page breaks are omitted on purpose.

## Development

```bash
npm test
npm run build
```

## License

MIT
