For every new user request, first make sure we share the same understanding before acting. Ask clarifying questions until the requested outcome, constraints, and success criteria are clear. Do not proceed with implementation when important ambiguity remains.

Deployment note for this project:

- Coolify is private on Tailscale and should be reached from this machine at `http://coolify1:8000`.
- Do not rely on GitHub webhooks for redeploys, because the Coolify HTTP port is not exposed publicly.
- Store the Coolify API token for this Tailscale host in `~/.secrets/coolify1.env`. Do not commit the token.
- When the user asks to push changes for redeploy, first push to GitHub successfully, then run `scripts/coolify-redeploy.sh`.
- The script defaults to the single Coolify application `eepa-app` (`nmu27zox7uqup1wngzgf0ie9`). If that default is removed, it discovers the Coolify application UUID through `GET http://coolify1:8000/api/v1/applications` by matching the current GitHub repository and branch, then calls `GET http://coolify1:8000/api/v1/deploy?uuid=<application-uuid>&force=false`.
