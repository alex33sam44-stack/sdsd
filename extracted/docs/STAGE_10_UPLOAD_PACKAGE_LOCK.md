# Stage 10 - Upload package lock

This stage adds an upload manifest so the package can be checked for accidental file changes before upload or deployment.

## Commands

```bash
npm run generate:upload-manifest
npm run verify:upload-manifest
```

The manifest is written to:

```text
release-evidence/pre-upload/upload-manifest.json
release-evidence/pre-upload/upload-manifest.sha256
```

It excludes volatile folders such as `node_modules`, `.git`, and `dist`.
