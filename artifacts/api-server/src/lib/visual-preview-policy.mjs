import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";

export const previewHash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function previewRevision(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value))
    throw Error("invalid_revision");
  return value;
}
export function publicAddress(address) {
  if (isIP(address) === 6)
    return /^2[0-9a-f]{3}:/i.test(address) && !/^200[12]:/i.test(address);
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
export async function assertPublicUrl(value, resolve = lookup) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !["", "80", "443"].includes(url.port)
  )
    throw Error("unsafe_preview_url");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await resolve(hostname, { all: true });
  if (
    !addresses.length ||
    addresses.some(({ address }) => !publicAddress(address))
  )
    throw Error("unsafe_preview_address");
  return url.href;
}
// Pin the connection to the DNS result we validated; Chromium never resolves the host again.
// Node validates and follows each redirect itself; no 30x reaches Chromium.
export async function fetchPublicPreviewResource(
  value,
  { resolveDns = lookup, getResource = null } = {},
  redirects = 0,
) {
  const safe = await assertPublicUrl(value, resolveDns),
    url = new URL(safe),
    hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await resolveDns(hostname, { all: true });
  if (
    !addresses.length ||
    addresses.some(({ address }) => !publicAddress(address))
  )
    throw Error("unsafe_preview_address");
  const pinned = addresses[0];
  return new Promise((resolve, reject) => {
    const get = getResource ?? (url.protocol === "https:" ? https : http).get;
    const request = get(
      url,
      {
        headers: {
          "accept-encoding": "identity",
          "user-agent": "AdOps-Visual-Preview/1.0",
        },
        lookup: (_host, options, callback) =>
          callback(
            null,
            options.all ? [pinned] : pinned.address,
            pinned.family,
          ),
      },
      (response) => {
        const chunks = [];
        let size = 0;
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > 20 * 1024 * 1024) {
            request.destroy(Error("preview_resource_too_large"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => {
          request.setTimeout(0);
          if (
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            response.statusCode !== 304
          ) {
            if (redirects >= 5 || !response.headers.location) {
              reject(Error("preview_redirect_limit"));
              return;
            }
            let next;
            try {
              next = new URL(response.headers.location, url).href;
            } catch {
              reject(Error("preview_invalid_redirect"));
              return;
            }
            fetchPublicPreviewResource(
              next,
              { resolveDns, getResource },
              redirects + 1,
            ).then(resolve, reject);
            return;
          }
          const headers = {};
          for (const [key, value] of Object.entries(response.headers)) {
            if (
              value &&
              ![
                "set-cookie",
                "transfer-encoding",
                "connection",
                "content-length",
                "location",
              ].includes(key)
            )
              headers[key] = Array.isArray(value) ? value.join(",") : value;
          }
          resolve({
            status: response.statusCode ?? 502,
            headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    request.setTimeout(15000, () =>
      request.destroy(Error("preview_resource_timeout")),
    );
    request.on("error", reject);
  });
}
export function previewConsumer(row) {
  const base = `/api/insertions/${row.insertion_id}/visual-previews/${encodeURIComponent(row.revision)}`;
  const { site, campaignName, pi, format, periodStart, periodEnd } =
    row.snapshot ?? {};
  const campaign = { site, campaignName, pi, format, periodStart, periodEnd };
  const caption = [
    "Prévia de cadastro",
    site,
    campaignName,
    pi,
    format,
    periodStart && periodEnd && `${periodStart} a ${periodEnd}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    id: row.id,
    insertionId: row.insertion_id,
    revision: row.revision,
    campaign,
    snapshotHash: row.snapshot_hash,
    status: row.status,
    error: row.error ?? null,
    statusUrl: base,
    downloadUrl: row.status === "completed" ? base + "/download" : null,
    contentType: "image/png",
    sha256: row.sha256 ?? null,
    publicationEnabled: false,
    isPublicationEvidence: false,
    automation:
      row.status === "completed"
        ? {
            kind: "visual_preview",
            method: "GET",
            url: base + "/download",
            requiresAuthorization: true,
            mimetype: "image/png",
            caption,
          }
        : null,
  };
}
