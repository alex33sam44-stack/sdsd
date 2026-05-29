# Production SMTP setup

Password registration requires email verification. Production launch must not proceed with blank or placeholder SMTP settings.

Configure a real SMTP provider on the VPS:

```bash
SMTP_HOST=smtp.your-provider.com \
SMTP_PORT=587 \
SMTP_USER='your-smtp-username' \
SMTP_PASS='your-smtp-password' \
SMTP_FROM='Mwasalat <no-reply@mwasalat.com>' \
npm run setup:smtp
```

The setup script writes `selfhost/.env.production` and then runs `npm run verify:smtp-config`. Full public-launch validation still requires the external backup gate to be configured separately.

`SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`, and `SMTP_PASS` are all required. The application refuses password sign-up in production when SMTP is incomplete.
