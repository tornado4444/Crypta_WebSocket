# Resend SMTP setup for CryptoAggregator

This project already supports any SMTP provider through Nodemailer. To enable password-reset emails with Resend, fill in the SMTP variables in `.env`.

## 1. Create a Resend account

Register at [https://resend.com](https://resend.com).

## 2. Create an API key

Open the Resend dashboard and create a new API key. For SMTP mode:
- host: `smtp.resend.com`
- port: `465`
- secure: `true`
- username: `resend`
- password: your Resend API key

Official docs: [https://resend.com/docs/send-with-smtp](https://resend.com/docs/send-with-smtp)

## 3. Configure `.env`

Use the following values:

```env
AUTH_RESET_SMTP_HOST="smtp.resend.com"
AUTH_RESET_SMTP_PORT=465
AUTH_RESET_SMTP_SECURE=true
AUTH_RESET_SMTP_USER="resend"
AUTH_RESET_SMTP_AUTH_MODE=""
AUTH_RESET_SMTP_PASS="re_xxxxxxxxxxxxxxxxx"
AUTH_RESET_SMTP_FROM="CryptoAggregator Security <onboarding@resend.dev>"
AUTH_RESET_SMTP_REPLY_TO="support@yourdomain.com"
AUTH_RESET_BROWSER_GMAIL=false
AUTH_RESET_ALLOW_CONSOLE_FALLBACK=false
```

Notes:
- `AUTH_RESET_SMTP_PASS` must be your real Resend API key.
- `AUTH_RESET_BROWSER_GMAIL=false` is required, otherwise the app switches into the browser-compose demo flow.
- `AUTH_RESET_SMTP_AUTH_MODE` must stay empty for classic SMTP login.
- `AUTH_RESET_SMTP_REPLY_TO` is optional, but it makes the email look more trustworthy when you use a real support address.

## 4. Choose a sender address

For quick testing, Resend provides `onboarding@resend.dev` as a default sender in some flows.
For production or stable demo usage, verify your own domain and use a sender like `noreply@yourdomain.com`.

Domain docs: [https://resend.com/docs/dashboard/domains/introduction](https://resend.com/docs/dashboard/domains/introduction)

## 5. Restart the project

```bash
cd C:\Crypta_WebSocket
npm run dev
```

## 6. Test the password reset flow

1. Open the site.
2. Click `Login / Register`.
3. Open `Forgot password`.
4. Enter a user email.
5. Click `Send code`.
6. The email should arrive in the user's mailbox.
7. Enter the code and set a new password.

## How it works for all users

Only the server knows the SMTP credentials. Users do not need access to Resend, Gmail, or `.env`.
They only enter their own email, and the server sends the reset code to that mailbox.

## How to reduce Spam placement

1. Verify your own domain in Resend.
2. Use a branded sender, for example `CryptoAggregator Security <noreply@yourdomain.com>`.
3. Set `AUTH_RESET_SMTP_REPLY_TO` to a valid support mailbox.
4. Ask users to mark the first message as `Not spam` during testing.
