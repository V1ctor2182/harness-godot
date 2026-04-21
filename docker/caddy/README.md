# Caddy — local pretty-domain reverse proxy

Routes `https://victorz.ludus` (or `$LUDUS_DOMAIN`) on your host to
the dashboard and server running in Docker. TLS uses Caddy's internal
CA so the browser shows a green lock once the root cert is trusted.

## One-time setup

1. **Add the hosts entry** so the OS resolves the pretty domain to
   localhost:

   ```bash
   echo '127.0.0.1 victorz.ludus' | sudo tee -a /etc/hosts
   ```

2. **Start the stack** at least once so Caddy generates its CA:

   ```bash
   docker compose up -d caddy
   ```

3. **Install Caddy's local CA into your system trust store** so the
   browser trusts its certs:

   ```bash
   docker compose exec caddy caddy trust
   ```

   (macOS: prompts for sudo to install into the login keychain.
   Reload Chrome/Safari after installing.)

4. Open https://victorz.ludus — green lock, dashboard loads, `/api/*`
   and `/events` reach the server.

## Overriding the domain

Export `LUDUS_DOMAIN` before bringing the stack up:

```bash
LUDUS_DOMAIN=foo.ludus docker compose up -d
```

Don't forget to add the new name to `/etc/hosts` too.
