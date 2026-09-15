# Japan Auction Invest V2.7 — Real Photo

Main images are extracted from official BIT court PDFs and saved to Netlify Blobs with source URL, extraction method, PDF page, and the v2.7 policy marker. Old unverified image caches are ignored. Missing photos display 待主圖. No page screenshot service is used.

The canonical BIT host is www.bit.courts.go.jp. Known case references are stored in data/bit-sources.json. Case 297562 uses the visually checked exterior photo on PDF page 15; the crop applies only when the downloaded PDF SHA-256 matches the verified document. Other PDFs use conservative photo-content checks and may remain without a cover.

## Automated updates

The Apply verified update GitHub Actions workflow accepts a base64 gzip JSON mapping of paths to UTF-8 contents, the expected current main SHA, and a commit message. Only repository writers can dispatch it. It rejects stale main versions, oversized bundles and paths outside the application. It checks JavaScript syntax, runs photo-policy tests, builds static files and pushes a normal commit to main. No permanent access token is stored in the repository.

The agent can submit future updates through the authenticated Actions page; users do not need to upload ZIP files. The session still requires GitHub write access. Netlify must build and automatically publish main. Verify each release with /DEPLOY_MANIFEST.json and /api/deploy-status; a successful GitHub update alone does not prove deployment.

## Build and verification

Install dependencies with pnpm. Run node --test tests/photo-policy.test.mjs and node scripts/build.mjs. Netlify publishes public/ and bundles netlify/functions/. PDF.js decoding assets and native canvas run only during the Netlify build.

POST /api/ingest-case with {"caseId":"297562","url":"https://xn--55q36pba3495a.com/auction/297562.html"}; then GET /api/property-image?id=297562&debug=1. Successful metadata must identify a BIT PDF, method three-doc-pdf, policy bit-real-photo-v27, and the actual PDF page. GET without debug returns the image. Court documents and images persist in Netlify Blobs; Google Drive is optional.

## PDF runtime compatibility

Photo decoding runs automatically during Netlify builds. The ingest API downloads the current official PDF and verifies its SHA-256 against the build-prepared image before storing that image in Blobs. A new or changed PDF without a matching prepared image remains 待主圖 until a subsequent build prepares it. Known official BIT references belong in data/bit-sources.json. This avoids loading native PDF/image decoders in request-serving functions.
