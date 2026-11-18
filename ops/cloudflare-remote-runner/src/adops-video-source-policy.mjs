import crypto from "node:crypto";

export const COD5_VIDEO_COMPRESSOR_URL_SOURCE_THRESHOLD_BYTES = 90 * 1024 * 1024;
export const COD5_VIDEO_COMPRESSOR_ADOPS_SOURCE_MAX_BYTES = 512 * 1024 * 1024;
export function resolveAdopsVideoCompressorApiBase(env = process.env) {
  return String(env.COD5_VIDEO_COMPRESSOR_ADOPS_API_BASE || "http://adops-video-compressor:8000").replace(/\/$/, "");
}

export function shouldUseAdopsVideoSourceUrl(sizeBytes, thresholdBytes = COD5_VIDEO_COMPRESSOR_URL_SOURCE_THRESHOLD_BYTES) {
  return Number(sizeBytes) > Number(thresholdBytes);
}

export function assertLargeAdopsVideoDriveMd5(sizeBytes, actualMd5, expectedMd5) {
  if (!shouldUseAdopsVideoSourceUrl(sizeBytes)) return false;
  if (!/^[a-f0-9]{32}$/i.test(String(expectedMd5 || "")) || String(actualMd5 || "").toLowerCase() !== String(expectedMd5).toLowerCase()) {
    throw new Error("drive_source_checksum_mismatch_before_compressor");
  }
  return true;
}

export function buildAdopsVideoSourceIdempotencyKey(sourceSha256, profile = "balanced-720p") {
  if (!/^[a-f0-9]{64}$/.test(String(sourceSha256 || ""))) throw new Error("adops_video_source_sha256_invalid");
  return crypto.createHash("sha256").update(`adops-video-source:v1:${sourceSha256}:${profile}`).digest("hex");
}

export function buildAdopsVideoSourceUrl(publicBase, sourceSha256) {
  if (!/^[a-f0-9]{64}$/.test(String(sourceSha256 || ""))) throw new Error("adops_video_source_sha256_invalid");
  const url = new URL(`${String(publicBase || "").replace(/\/$/, "")}/adops-sources/video/${sourceSha256}.mp4`);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== `/adops-sources/video/${sourceSha256}.mp4`) {
    throw new Error("adops_video_source_url_invalid");
  }
  return url.toString();
}

export function identifyAdopsVideoSource(bytes, expectedSha256 = null, expectedMd5) {
  if (!Buffer.isBuffer(bytes) || !/^[a-f0-9]{32}$/i.test(String(expectedMd5 || ""))) {
    throw new Error("adops_video_source_checksum_missing");
  }
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const md5 = crypto.createHash("md5").update(bytes).digest("hex");
  if (expectedSha256 && (!/^[a-f0-9]{64}$/.test(expectedSha256) || sha256 !== expectedSha256)) {
    throw new Error("adops_video_source_sha256_mismatch");
  }
  if (md5 !== String(expectedMd5).toLowerCase()) throw new Error("adops_video_source_md5_mismatch");
  return { sha256, md5 };
}
