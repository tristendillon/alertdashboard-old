# Free-tier bot / scanner hardening for the proxied hosts in this zone.
# The web + listener custom domains are orange-clouded (see workers.tf), so
# these zone rulesets apply to them; Clerk's CNAMEs are DNS-only and bypass the
# proxy, so they're unaffected. No regex `matches` operator is used — that needs
# a Business plan; `contains`/`ends_with`/`lower()` work on Free.

# Custom firewall rules (WAF).
resource "cloudflare_ruleset" "waf_custom" {
  zone_id = data.cloudflare_zone.this.zone_id
  name    = "alertdashboard custom firewall"
  kind    = "zone"
  phase   = "http_request_firewall_custom"

  rules = [
    {
      description = "Block common scanner / exploit paths (app never serves these)"
      action      = "block"
      enabled     = true
      expression = join(" or ", [
        "(lower(http.request.uri.path) contains \"/wp-admin\")",
        "(lower(http.request.uri.path) contains \"/wp-login\")",
        "(lower(http.request.uri.path) contains \"xmlrpc.php\")",
        "(ends_with(lower(http.request.uri.path), \".php\"))",
        "(lower(http.request.uri.path) contains \"/.env\")",
        "(lower(http.request.uri.path) contains \"/.git\")",
        "(lower(http.request.uri.path) contains \"/phpmyadmin\")",
        "(lower(http.request.uri.path) contains \"/vendor/\")",
        "(lower(http.request.uri.path) contains \"/.aws\")",
        "(lower(http.request.uri.path) contains \"/.ssh\")",
      ])
    },
    {
      # This rule used to challenge *every* request to /dashboard*, which
      # included the Next.js Server Action POSTs behind the admin invite flow —
      # a managed challenge mid-`fetch` has no browser interstitial to solve, so
      # those posts just failed. The condition that belongs here is
      # `cf.bot_management.score lt 30`, but bot score requires an Enterprise
      # plan with Bot Management and is unavailable on this Free zone (Free only
      # gets the Bot Fight Mode toggle, no scoreable field). Rather than invent a
      # substitute signal, the rule now only challenges non-POST requests: real
      # scanners hitting the admin surface still get an interstitial on their GET
      # navigation, and no form post or server action is ever challenged.
      description = "Managed-challenge non-POST traffic to the admin surface (bot score is Enterprise-only)"
      action      = "managed_challenge"
      enabled     = true
      expression  = "(http.host eq \"${local.web_hostname}\" and starts_with(http.request.uri.path, \"/dashboard\") and http.request.method ne \"POST\")"
    },
  ]
}

# Per-IP rate limiting on the web host. Excludes static assets and the RSS feed
# so kiosks and feed readers are never throttled; a single page load is far
# under the threshold, aggressive scanners get blocked.
resource "cloudflare_ruleset" "rate_limit" {
  zone_id = data.cloudflare_zone.this.zone_id
  name    = "alertdashboard rate limiting"
  kind    = "zone"
  phase   = "http_ratelimit"

  rules = [
    {
      description = "Block high-volume per-IP traffic to the web host"
      # Free plan only permits the `block` action in the ratelimiting phase
      # (managed_challenge is not entitled here).
      action  = "block"
      enabled = true
      # Everything under apps/web/public/ is served from the origin path, not
      # /_next/, so it was still counting against the budget — the map view
      # pulls a marker sprite per hydrant and per incident out of /icons/, which
      # is exactly the kind of burst that trips 50 requests in 10s.
      expression = join(" and ", [
        "(http.host eq \"${local.web_hostname}\")",
        "(not starts_with(http.request.uri.path, \"/_next/\"))",
        "(not starts_with(http.request.uri.path, \"/rssfeed\"))",
        "(not starts_with(http.request.uri.path, \"/icons/\"))",
        "(not starts_with(http.request.uri.path, \"/logos/\"))",
      ])
      ratelimit = {
        # Free plan only permits a 10s window and a matching mitigation timeout.
        #
        # Counting on ip.src + cf.colo.id means the bucket is per public IP, not
        # per device: every kiosk, phone and laptop behind a firehouse's single
        # NAT shares one 50-req/10s allowance. That shared bucket — not any one
        # scanner — is the realistic way a station gets throttled, so keep the
        # exclusion list above current whenever new static asset dirs are added.
        characteristics     = ["ip.src", "cf.colo.id"]
        period              = 10
        requests_per_period = 50
        mitigation_timeout  = 10
      }
    },
  ]
}
