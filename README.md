# DNS Controller

Free subdomain service for the everyone. This project bundles a landing page and a small backend so anyone can instantly claim a subdomain, keep it pointed to an IP address, and manage it later with a password they set.

## What It Is For

- Give builders, hobbyists, and small communities a no-cost way to publish projects under a shared domain.
- Remove paperwork: you just enter a subdomain, an IPv4 address, and a password - no registrar required.
- Keep ownership simple: you can update or delete the record whenever you want using the same password.

## How It Works

1. You check if a subdomain like `demo.sitey.one` is free.
2. When you create it, the app writes an A record on Cloudflare for that subdomain so it resolves to your server's IP.
3. The same information is stored in a local JSON file together with the password you provided (stored as plain text today - treat it as a shared secret).
4. Whenever you change or delete the subdomain, the app first confirms the password against the stored entry and then updates or removes the matching A record on Cloudflare.

Nothing else is required from the user's side - no manual DNS changes, no control panel login.

## How to Use It

- **Claim**: Type a subdomain, supply the IP address for your server, set a password, and hit create. Keep the password safe - you need it for changes.
- **Update**: Enter the same subdomain, verify with your password, and provide the new IPv4 address. The DNS record is updated on Cloudflare within seconds.
- **Delete**: Verify with your password and request deletion to remove the subdomain both locally and on Cloudflare.
- **Check activity**: The landing page shows a live counter of active subdomains so you can gauge overall usage.

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
