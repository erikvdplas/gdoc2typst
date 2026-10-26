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
5. Download the client JSON (`client_secret_….json`). It contains `installed.client_id` and `installed.client_secret`.

Never commit that file or the client secret. Pass the file path, or the id and secret, via flags or environment variables.

## Install

```bash
npm install
npm run build
npm link   # optional: expose `gdoc2typst` on your PATH
```

## Authenticate

```bash
gdoc2typst auth login --credentials ~/Downloads/client_secret.json

# or point at the same file with an environment variable:
export GOOGLE_OAUTH_CREDENTIALS="$HOME/Downloads/client_secret.json"
gdoc2typst auth login

# or pass the id and secret directly:
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

`auth login` and `convert` resolve the OAuth client in this order: `--client-id` and `--client-secret`, then `--credentials`, then `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then `GOOGLE_OAUTH_CREDENTIALS` (a path to the downloaded JSON), then a client already stored in the keychain. A service-account key is rejected; the file must be an OAuth client download.

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
