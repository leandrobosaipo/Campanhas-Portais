import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat, statfs } from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";

export const DEFAULT_IMAGE_MEDIA_MAX_BYTES = 256 * 1024 * 1024;
export const DEFAULT_VIDEO_MEDIA_MAX_BYTES = 512 * 1024 * 1024;
export const DEFAULT_VIDEO_DISK_RESERVE_BYTES = 500 * 1024 * 1024;

export function isVideoMedia(file = {}) {
  return /^video\//i.test(String(file.mimeType || "")) || /\.(mp4|mov|m4v|webm)$/i.test(String(file.name || ""));
}

export function mediaMaxBytes(file, { imageMaxBytes = DEFAULT_IMAGE_MEDIA_MAX_BYTES, videoMaxBytes = DEFAULT_VIDEO_MEDIA_MAX_BYTES } = {}) {
  return isVideoMedia(file) ? videoMaxBytes : imageMaxBytes;
}

export function assertExpectedDriveMediaMd5(expectedMd5, mediaItem) {
  const expected = String(expectedMd5 || "").trim().toLowerCase();
  if (!expected) return true;
  const actual = String(mediaItem?.md5Checksum || "").trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(expected) || !/^[a-f0-9]{32}$/.test(actual) || actual !== expected) {
    throw new Error("Checksum Drive confirmado ausente ou divergente da mídia selecionada.");
  }
  return true;
}

export async function findVerifiedArchivedMedia({ directory, fileName, expectedBytes, expectedMd5, readdirFn = readdir, statFn = stat, createReadStreamFn = createReadStream }) {
  const expected = String(expectedMd5 || "").trim().toLowerCase();
  const bytesExpected = Number(expectedBytes) || 0;
  if (!/^[a-f0-9]{32}$/.test(expected) || bytesExpected <= 0) return null;
  const safeName = String(fileName || "media").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "media";
  let names = [];
  try { names = await readdirFn(directory); } catch { return null; }
  for (const name of names) {
    if (!name.endsWith(`-${safeName}`)) continue;
    const filePath = path.join(directory, name);
    let info;
    try { info = await statFn(filePath); } catch { continue; }
    if (!info.isFile() || info.size !== bytesExpected) continue;
    const md5 = createHash("md5");
    try {
      for await (const chunk of createReadStreamFn(filePath)) md5.update(chunk);
    } catch { continue; }
    const actualMd5 = md5.digest("hex");
    if (actualMd5 === expected) return { filePath, bytes: info.size, md5: actualMd5, cached: true };
  }
  return null;
}

export async function assertDiskBudget({ directory, expectedBytes, reserveBytes = 0, statfsFn = statfs }) {
  const free = await statfsFn(directory);
  const availableBytes = Number(free.bavail) * Number(free.bsize);
  const requiredBytes = Math.max(0, Number(expectedBytes) || 0) + Math.max(0, Number(reserveBytes) || 0);
  if (!Number.isFinite(availableBytes) || availableBytes < requiredBytes) {
    throw new Error(`Espaço livre insuficiente para a mídia: necessário ${requiredBytes} bytes incluindo reserva; disponível ${Number.isFinite(availableBytes) ? availableBytes : "desconhecido"}.`);
  }
  return { availableBytes, requiredBytes };
}

export async function streamDriveMediaToArchive({
  response,
  directory,
  fileName,
  expectedBytes,
  expectedMd5,
  maxBytes,
  reserveBytes = 0,
  statfsFn = statfs,
}) {
  if (!response?.ok || !response.body) throw new Error("Resposta de mídia sem corpo válido.");
  const expected = Number(expectedBytes) || 0;
  const contentLength = Number(response.headers?.get?.("content-length") || 0);
  if (expected > maxBytes || contentLength > maxBytes) {
    throw new Error(`Arquivo do Drive excede limite operacional de ${maxBytes} bytes.`);
  }
  if (expected && contentLength && expected !== contentLength) {
    throw new Error("Tamanho do download do Drive diverge do metadado da mídia.");
  }

  await mkdir(directory, { recursive: true });
  const disk = await assertDiskBudget({ directory, expectedBytes: expected || contentLength || maxBytes, reserveBytes, statfsFn });
  const tempPath = path.join(directory, `.adops-media-${randomUUID()}.partial`);
  let totalBytes = 0;
  const md5 = createHash("md5");
  const sha256 = createHash("sha256");
  const meter = new Transform({
    transform(chunk, encoding, callback) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
      totalBytes += bytes.length;
      if (totalBytes > maxBytes || (expected && totalBytes > expected)) {
        callback(new Error(`Download de mídia excedeu tamanho permitido (${maxBytes} bytes).`));
        return;
      }
      md5.update(bytes);
      sha256.update(bytes);
      callback(null, bytes);
    },
  });

  try {
    await pipeline(response.body, meter, createWriteStream(tempPath, { flags: "wx", mode: 0o600 }));
    const actualMd5 = md5.digest("hex");
    const actualSha256 = sha256.digest("hex");
    if (expected && totalBytes !== expected) throw new Error("Tamanho final do download diverge do metadado do Drive.");
    if (expectedMd5 && actualMd5.toLowerCase() !== String(expectedMd5).toLowerCase()) {
      throw new Error("MD5 do download diverge do checksum do Drive.");
    }
    const safeName = String(fileName || "media").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "media";
    const filePath = path.join(directory, `${actualSha256.slice(0, 12)}-${safeName}`);
    await rename(tempPath, filePath);
    return { filePath, bytes: totalBytes, md5: actualMd5, sha256: actualSha256, disk };
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function probeVideoMetadata(filePath, execFileAsync) {
  const run = async (label, command, args, timeout) => {
   for(let attempt=0;attempt<2;attempt++){
    try {
      return await execFileAsync(command, args, { timeout, maxBuffer: 1024 * 1024 });
    } catch (error) {
      const stderr = String(error?.stderr || "").trim().slice(0, 600);
      const signal = error?.signal ? ` signal=${error.signal}` : "";
      const timedOut = error?.killed === true || error?.code === "ETIMEDOUT";
      // Read-only inspection of the same archived bytes. Never retries an upload.
      if(timedOut&&attempt===0){await new Promise(resolve=>setTimeout(resolve,2000));continue;}
      const timeoutText = timedOut ? " timeout=true" : "";
      const code = error?.code != null && error.code !== "ETIMEDOUT" ? ` code=${error.code}` : "";
      throw new Error(`${label} falhou:${timeoutText}${signal}${code}${stderr ? ` stderr=${stderr}` : " stderr=(vazio)"}`);
    }
   }
  };
  const { stdout } = await run("ffprobe", "ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=codec_name,width,height,pix_fmt,nb_frames,duration:format=format_name,duration",
    "-show_streams", "-show_format", "-of", "json", filePath,
  ], 30000);
  const parsed = JSON.parse(stdout);
  const stream = parsed?.streams?.[0];
  const formatName = String(parsed?.format?.format_name || "").toLowerCase();
  if (!stream || !/(^|,)mp4(,|$)|mov/.test(formatName)) throw new Error("Container de vídeo não é MP4 válido.");
  await run("amostra do primeiro frame", "ffmpeg", ["-v", "error", "-i", filePath, "-map", "0:v:0", "-frames:v", "1", "-f", "null", "-"], 30000);
  await run("amostra do último frame", "ffmpeg", ["-v", "error", "-sseof", "-1", "-i", filePath, "-map", "0:v:0", "-frames:v", "1", "-f", "null", "-"], 30000);
  const metadata = {
    format: "MP4",
    codec: String(stream.codec_name || "").toLowerCase(),
    width: Number(stream.width),
    height: Number(stream.height),
    pixelFormat: String(stream.pix_fmt || "").toLowerCase(),
    duration: Number(parsed?.format?.duration),
    frames: Number.isFinite(Number(stream.nb_frames)) ? Number(stream.nb_frames) : null,
  };
  if (metadata.codec !== "h264" || !Number.isFinite(metadata.duration) || metadata.duration <= 0
    || metadata.width <= 0 || metadata.height <= 0 || (metadata.frames !== null && (!Number.isInteger(metadata.frames) || metadata.frames <= 0))) {
    throw new Error("Vídeo MP4 precisa ser H.264, ter duração positiva e dimensões válidas; contagem de quadros ausente permanece não informada.");
  }
  return metadata;
}
