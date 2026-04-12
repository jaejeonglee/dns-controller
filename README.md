# DNS Controller

Free subdomain service for the everyone. This project bundles a landing page and a small backend so anyone can instantly claim a subdomain, keep it pointed to an IP address, and manage it later with a password they set.

## What It Is For

- Give builders, hobbyists, and small communities a no-cost way to publish projects under a shared domain.
- Remove paperwork: sign in with Google, type a subdomain plus the address you want it to point at, and you're done — no registrar required.
- Keep ownership simple: each subdomain is tied to your Google account, so you can update or delete it any time you're signed in.

## How It Works

1. You sign in with your Google account so we know who owns each subdomain.
2. You check if a subdomain like `demo.sitey.one` is free.
3. When you create it, the app appends an `A` (or `CNAME`) record to the BIND9 zone file we operate, increments the zone serial, and reloads BIND with `named-checkconf` / `named-checkzone` / `systemctl reload named` so the new record is served immediately.
4. Ownership and metadata (which Google account owns which subdomain, when it was last validated, etc.) are stored in MySQL.
5. Whenever you change or delete the subdomain, the app verifies that you own it via your session, then updates or removes the matching record in the same zone file.

This means we run our own authoritative BIND9 nameserver on the same host as the app — we are not delegating to a managed DNS provider like Cloudflare or Route53. The only manual setup is on the operator side (BIND9 + zone file permissions + a `systemd` service named `named`).

## How to Use It

- **Sign in**: Click "Sign in with Google" and grant the basic profile/email scope. Your account becomes the owner of any subdomain you claim afterwards.
- **Claim**: Type a subdomain, supply the IPv4 address (`A`) or hostname (`CNAME`) you want it to point at, and hit create. The record is written to the zone file and served by BIND9 within seconds.
- **Update**: Pick one of your existing subdomains from the dashboard and provide the new value. Ownership is enforced server-side via your session.
- **Delete**: Pick one of your existing subdomains and request deletion to remove it from both the database and the zone file.
- **Check activity**: The landing page shows a live counter of active subdomains so you can gauge overall usage.

A background validator periodically checks that each registered subdomain is still reachable. After two consecutive failures the owner gets a warning email and the record is removed automatically — this keeps the shared namespace from filling up with dead pointers.

## Use Cases

- Launch a staging site with a memorable address without paying for a new domain.
- Share workshop, hackathon, or study project demos with teammates under one branded namespace.
- Spin up temporary mirrors or short-lived campaigns where owning a domain would be overkill.
- Provide community members with personal pages while centrally managing the root domain.

## Support & Appreciation

- Found this useful? You can fuel the next improvement by buying a coffee: https://www.buymeacoffee.com/helpmeup
- Need help or want to report a bug? Reach out via `https://t.me/+yvrIFDbssJ0wNDJl`.

## License

Released under the [ISC License](LICENSE).
