import { createHash, createHmac } from "node:crypto";

// Bounded API-side upload (request and readback buffers coexist); the runner's 256 MiB media ceiling is not appropriate here.
export const MAX_LOCAL_MEDIA_BYTES = 32 * 1024 * 1024;
const MEDIA_TYPES = {
  "image/gif": { extension: "gif", matches: (bytes: Buffer) => bytes.subarray(0, 6).toString("ascii") === "GIF87a" || bytes.subarray(0, 6).toString("ascii") === "GIF89a" },
  "image/png": { extension: "png", matches: (bytes: Buffer) => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  "image/jpeg": { extension: "jpg", matches: (bytes: Buffer) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  "image/webp": { extension: "webp", matches: (bytes: Buffer) => bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" },
  "video/mp4": { extension: "mp4", matches: (bytes: Buffer) => bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp" },
} as const;

export class LocalMediaUploadError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "LocalMediaUploadError";
  }
}

function validateMedia(bytes: Buffer, contentType: string) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new LocalMediaUploadError("empty_media", 400);
  if (bytes.length > MAX_LOCAL_MEDIA_BYTES) throw new LocalMediaUploadError("media_too_large", 413);
  const media = MEDIA_TYPES[contentType as keyof typeof MEDIA_TYPES];
  if (!media) throw new LocalMediaUploadError("unsupported_media_type", 415);
  if (!media.matches(bytes)) throw new LocalMediaUploadError("media_signature_mismatch", 415);
  return { ...media, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function mediaObjectKey(sha256: string, extension: string, env: NodeJS.ProcessEnv) {
  const basePath = (env.ADOPS_VIDEO_MEDIA_BASE_PATH || "adops-media").replace(/^\/+|\/+$/g, "");
  return `${basePath}/local-imports/${sha256}.${extension}`;
}

function signedHeaders(url: URL, bytes: Buffer, contentType: string, env: NodeJS.ProcessEnv) {
  const accessKeyId = env.DO_SPACES_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.DO_SPACES_SECRET_ACCESS_KEY?.trim();
  const region = env.DO_SPACES_REGION?.trim() || "nyc3";
  if (!accessKeyId || !secretAccessKey) throw new LocalMediaUploadError("media_storage_not_configured", 503);

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const bodyHash = createHash("sha256").update(bytes).digest("hex");
  const headers: Record<string, string> = {
    "content-type": contentType,
    host: url.host,
    "x-amz-acl": "public-read",
    "x-amz-content-sha256": bodyHash,
    "x-amz-date": amzDate,
  };
  const names = Object.keys(headers).sort();
  const signed = names.join(";");
  const canonicalHeaders = names.map((name) => `${name}:${headers[name]!.trim()}\n`).join("");
  const canonicalRequest = ["PUT", url.pathname, url.search.slice(1), canonicalHeaders, signed, bodyHash].join("\n");
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");
  const dateKey = createHmac("sha256", `AWS4${secretAccessKey}`).update(dateStamp).digest();
  const regionKey = createHmac("sha256", dateKey).update(region).digest();
  const serviceKey = createHmac("sha256", regionKey).update("s3").digest();
  const signingKey = createHmac("sha256", serviceKey).update("aws4_request").digest();
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const { host: _host, ...requestHeaders } = headers;
  return { ...requestHeaders, Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signed}, Signature=${signature}` };
}

function buildUrls(key: string, env: NodeJS.ProcessEnv) {
  let endpoint: URL;
  try {
    endpoint = new URL(env.DO_SPACES_ENDPOINT || "https://nyc3.digitaloceanspaces.com");
  } catch {
    throw new LocalMediaUploadError("invalid_media_storage_endpoint", 503);
  }
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new LocalMediaUploadError("invalid_media_storage_endpoint", 503);
  }
  const bucket = (env.ADOPS_VIDEO_MEDIA_BUCKET || env.ADOPS_SPACES_BUCKET || "cod5").trim();
  if (!/^[A-Za-z0-9.-]{3,63}$/.test(bucket)) throw new LocalMediaUploadError("invalid_media_bucket", 503);
  const encodedKey = key.split("/").map((part) => encodeURIComponent(part)).join("/");
  const storageUrl = new URL(`${endpoint.toString().replace(/\/$/, "")}/${encodeURIComponent(bucket)}/${encodedKey}`);
  const publicBase = env.ADOPS_VIDEO_MEDIA_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (publicBase) {
    try {
      const publicUrl = new URL(publicBase);
      if (publicUrl.protocol !== "https:" || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash) {
        throw new Error("invalid public media base");
      }
    } catch {
      throw new LocalMediaUploadError("invalid_media_public_base_url", 503);
    }
  }
  const region = env.DO_SPACES_REGION?.trim() || endpoint.hostname.split(".")[0] || "nyc3";
  const publicOrigin = publicBase || (endpoint.hostname.endsWith(".digitaloceanspaces.com")
    ? `https://${bucket}.${region}.digitaloceanspaces.com`
    : `${endpoint.origin}/${encodeURIComponent(bucket)}`);
  return { storageUrl, publicUrl: `${publicOrigin}/${encodedKey}`, bucket };
}

export async function uploadLocalMediaAsset(args: {
  bytes: Buffer;
  contentType: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}) {
  const env = args.env ?? process.env;
  const fetchImpl = args.fetchImpl ?? fetch;
  const contentType = args.contentType.split(";", 1)[0]!.trim().toLowerCase();
  const media = validateMedia(args.bytes, contentType);
  const objectKey = mediaObjectKey(media.sha256, media.extension, env);
  const { storageUrl, publicUrl, bucket } = buildUrls(objectKey, env);
  const response = await fetchImpl(storageUrl, {
    method: "PUT",
    headers: signedHeaders(storageUrl, args.bytes, contentType, env),
    body: args.bytes,
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new LocalMediaUploadError(`media_upload_failed_${response.status}`, 502);

  const readback = await fetchImpl(publicUrl, { method: "GET", redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!readback.ok) throw new LocalMediaUploadError(`media_readback_failed_${readback.status}`, 502);
  const copiedBytes = Buffer.from(await readback.arrayBuffer());
  if (copiedBytes.length > MAX_LOCAL_MEDIA_BYTES || copiedBytes.length !== args.bytes.length) {
    throw new LocalMediaUploadError("media_readback_size_mismatch", 502);
  }
  const readbackSha256 = createHash("sha256").update(copiedBytes).digest("hex");
  if (readbackSha256 !== media.sha256) throw new LocalMediaUploadError("media_readback_hash_mismatch", 502);
  const readbackType = readback.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (readbackType && readbackType !== contentType) throw new LocalMediaUploadError("media_readback_content_type_mismatch", 502);

  return {
    ok: true as const,
    validation: "signature_and_storage_readback_only" as const,
    requiresMediaPreflight: true as const,
    mediaUrl: publicUrl,
    objectKey,
    bucket,
    contentType,
    bytes: args.bytes.length,
    sha256: media.sha256,
    readback: { verified: true as const, status: readback.status, contentType: readbackType ?? contentType, bytes: copiedBytes.length, sha256: readbackSha256 },
  };
}
