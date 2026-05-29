# Security Policy

This package is intended for self-hosted deployment. Do not commit production secrets, database credentials, API tokens, private keys, or generated runtime evidence into this repository.

## Reporting a vulnerability

Report security issues privately to the project maintainers. Include affected version, reproduction steps, expected impact, and suggested mitigation if available.

## Secret hygiene

Use environment-specific `.env` files outside version control for real credentials. The included example files must contain placeholders only.
