# Public hosting for demo

This project already listens on `0.0.0.0`, so the Node server can accept external traffic. A browser error like `DNS_PROBE_FINISHED_NXDOMAIN` means the domain itself does not resolve in DNS yet. That cannot be fixed by JavaScript or Express code.

## Fast public link, no custom domain

Use Cloudflare Quick Tunnel. You run one command on your PC, and other people open a normal HTTPS link in their browser.

1. Install Cloudflare tunnel once:

```powershell
winget install --id Cloudflare.cloudflared -e
```

2. Start the app and the public tunnel:

```powershell
cd C:\Crypta_WebSocket
npm run public:tunnel
```

3. Copy the `https://....trycloudflare.com` URL from the terminal.

4. Send that URL to other people. They do not need Node.js, npm, or your project files.

5. If shared report links must also use the same public address, put the tunnel URL into `.env`:

```env
PUBLIC_BASE_URL="https://your-generated-url.trycloudflare.com"
```

Then restart `npm run public:tunnel`.

## If the app is already running

If `npm run dev` is already open in another terminal:

```powershell
cd C:\Crypta_WebSocket
npm run public:tunnel:no-app
```

## Permanent custom domain: `delabopablo.dpdns.org`

For a permanent domain like `delabopablo.dpdns.org`, do not create an `A` record to a random IPv4 address unless you have a real public server and port forwarding. For this local Node app, use a named Cloudflare Tunnel.

One-time setup:

```powershell
cd C:\Crypta_WebSocket
npm run domain:setup
```

During setup, Cloudflare opens a browser login page. Select the zone `delabopablo.dpdns.org` and approve it. The script will:

- create or reuse a named tunnel `cryptoaggregator`;
- create DNS routes for `delabopablo.dpdns.org` and `www.delabopablo.dpdns.org`;
- write a tunnel config into `%USERPROFILE%\.cloudflared`;
- set `PUBLIC_BASE_URL="https://delabopablo.dpdns.org"` in `.env`.

After setup, run:

```powershell
cd C:\Crypta_WebSocket
npm run domain:tunnel
```

Keep that terminal open. Then open:

```text
https://delabopablo.dpdns.org
```

For diploma/demo, Quick Tunnel is still the fastest temporary option, but `domain:setup` + `domain:tunnel` is the correct option for your own domain.
