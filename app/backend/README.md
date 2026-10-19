# Waraq processing companion

The static website and desktop edition perform browser operations on your device. This optional Node companion adds native PDF engines and controlled connections to your own services. It does not pretend that an absent engine is installed. Nothing is uploaded while checking capabilities.

## Local start

Use Node.js 22 or later. From the Waraq folder run:

```powershell
node server.cjs
```

Open `http://127.0.0.1:4173`. The companion binds to loopback. No API token is required in this default mode. Browser tools work without installing any engine. Install native engines separately or use the container below to enable the relevant operations. No executable is downloaded automatically.

| Operation | Native engine | Optional service |
|---|---|---|
| Repair, 256-bit password encryption, decrypt with known password | qpdf | Stirling PDF |
| Flatten forms and annotation appearances | qpdf | Stirling PDF (forms only) |
| Arabic/English searchable PDF and PDF/A | OCRmyPDF + Tesseract ara/eng | Stirling PDF |
| Office to PDF, PDF to Word/PowerPoint | LibreOffice | Stirling PDF |
| PDF tables to Excel | — | Stirling PDF |
| Digital signature inspection | — | Stirling PDF |
| Text-match redaction with raster output | — | Compatible Stirling PDF API |
| AI OCR parse result (JSON) | — | Compatible ocrbase API + separately hosted model |

Run `node backend/test.cjs` to check request security, unavailable-engine handling, subprocess cancellation and mock-server adapter contracts. These tests do not establish the fidelity of real OCR, Office conversion, redaction or signature validation.

## Full native engine container

Install Docker separately. This image includes qpdf, OCRmyPDF, Arabic and English Tesseract models, LibreOffice, Ghostscript and Arabic-capable Noto fonts. Initial image build needs internet; native processing can run offline after the image is built. The image build has not been verified on this Windows workstation because Docker is not installed.

Generate a token and launch from the Waraq folder:

```powershell
$env:WARAQ_API_TOKEN = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
docker compose -f backend/compose.yaml up --build -d
$env:WARAQ_API_TOKEN
```

Open `http://127.0.0.1:4173`, choose Processing engines, leave the address blank and paste the generated token. It is kept only in the browser session. Store the token securely if you need to restart the container; the shell variable lasts only for that shell session. Alternatively put it in `backend/.env` and supply `--env-file backend/.env` to Compose. Do not commit real credentials.

The container exposes only the host loopback port. It runs as a non-root user with a read-only filesystem, a 1 GiB temporary filesystem, dropped Linux capabilities, two CPUs and a 2 GiB memory limit. Native PDF/Office parsers remain security-sensitive; use a dedicated isolated host for documents from untrusted sources. Docker blocks neither outbound networking nor every kernel attack by default. For an entirely disconnected setup, disconnect the host network after installation or enforce egress restrictions in your deployment.

## Online or hosted website connection

The static site cannot execute native binaries. Host this companion on infrastructure that can run Node and native engines. Set:

```text
WARAQ_BIND=0.0.0.0
WARAQ_API_TOKEN=<random token, at least 24 characters>
WARAQ_PUBLIC_ORIGIN=https://pdf-engine.example.com
WARAQ_ALLOWED_ORIGINS=https://your-waraq-site.example.com
```

Terminate TLS at your reverse proxy, preserve the public Host header, and forward to port 4173. Enter the HTTPS engine origin in Waraq and paste the token for that session. The UI asks you to send the document for each engine operation. Remote binds and configured origins refuse to start without a token. An Internet deployment also needs deployment-specific authentication, rate limiting and monitoring at the proxy; the bundled single-user token service is not a multi-tenant processing platform.

To connect a hosted Waraq page to a local companion, keep the loopback bind and set `WARAQ_ALLOWED_ORIGINS` to that page's exact origin plus `WARAQ_API_TOKEN`. Browser local-network permissions may be required. No wildcard origins are accepted.

## Configured service adapters

Set `WARAQ_STIRLING_URL` and optionally `WARAQ_STIRLING_API_KEY` on the companion. It retrieves the installed service's `/v3/api-docs` document and enables only mapped POST operations with a compatible multipart schema. `WARAQ_STIRLING_SCHEMA_PATH` can override the schema path. The API key stays server-side. Native engines take priority when installed; a failed native job is not silently uploaded to a remote service. Capabilities are cached for 30 seconds. A discoverable endpoint does not prove that its optional engine or model is installed; runtime failures are returned honestly.

For ocrbase set `WARAQ_OCRBASE_URL`, optional `WARAQ_OCRBASE_API_KEY`, `WARAQ_OCRBASE_SCHEMA_PATH` (default `/openapi/json`) and `WARAQ_OCRBASE_MODEL` (default `paddleocr`). The adapter requires a live OpenAPI document describing `/v1/parse` with a multipart binary file and optional model field. Incompatible releases stay unavailable. Set the schema path to the one exposed by your deployment, such as `/swagger/json`, if appropriate. It returns the service's JSON parse output. The current [ocrbase repository](https://github.com/majcheradam/ocrbase) is archived and requires a separate inference server; model terms and external storage/retention depend on that deployment. This is an optional compatibility adapter, not a bundled model.

## API

- `GET /api/capabilities` → `{version:1, location:"local", engines:{...}, operations:{id:{available,engine,location,reason,languages}}, limits:{...}}`.
- `POST /api/process/:id`, headers `Content-Type: application/json`, `X-Waraq-Client: 1`, and `Authorization: Bearer ...` when a token is configured.
- JSON body: `{filename:"document.pdf",data:"<base64>",options:{...}}`.
- Options: `password` for protect/unlock; optional `ownerPassword` for protect; `language` (`ara`, `eng`, `ara+eng`) for OCR/PDF-A; `text` for text-match redaction.
- Success: binary attachment with content type, UTF-8 Content-Disposition filename and `X-Waraq-Engine`.
- Error: `{error:"human-readable message",code:"stable identifier"}` with 4xx/5xx status.

The request limit is 50 MiB decoded, the result limit is 100 MiB, and only one document job runs at a time. Native jobs use random private temporary directories and a three-minute execution deadline. A disconnected/cancelled request kills its native process group; configured remote services may continue their own work after cancellation. Temporary job directories are deleted after success or failure; forced host shutdown can leave files until OS temp cleanup. The companion never logs filenames, passwords or document content. Service credentials are never returned by the capability API. Data retained by optional remote engines is governed by those engines.

## Processing limitations

Office conversion is layout-dependent and may change Arabic fonts, line breaks and reading order. Review exports. PDF-to-Office conversion is not lossless reconstruction or arbitrary in-place PDF text editing. qpdf repair is a best-effort structural rewrite. Its flatten operation flattens forms **and annotations** with existing appearances; missing appearances cannot be reconstructed. OCR requires the chosen language packs and may reject signed files rather than invalidate their signatures. PDF/A output needs independent archival validation for regulated use.

Stirling text-match redaction is requested with literal matching and rasterized output, but this adapter has not passed a hostile-content sanitization corpus. Verify the output before relying on irreversible removal. Signature inspection reports engine findings; it does not issue certificates, create certificate-based signatures or establish legal validity. The provided interfaces do not implement full existing-object text editing or cryptographic signing.

## Upstream references

- [qpdf CLI](https://qpdf.readthedocs.io/en/stable/cli.html)
- [OCRmyPDF cookbook](https://ocrmypdf.readthedocs.io/en/latest/cookbook.html)
- [Stirling API compatibility and discovery](https://docs.stirlingpdf.com/Migration/Breaking-Changes/)
- [Stirling PDF-to-Office controller](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/app/core/src/main/java/stirling/software/SPDF/controller/api/converters/ConvertPDFToOffice.java)
- [ocrbase](https://github.com/majcheradam/ocrbase)

The Docker build uses distribution packages rather than redistributing native binaries in this source bundle. Review upstream licenses and notices before shipping a built image or commercial distribution.
