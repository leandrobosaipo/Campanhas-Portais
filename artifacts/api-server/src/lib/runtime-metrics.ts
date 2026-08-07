import { readFile } from "node:fs/promises";

async function readText(path: string) {
  return readFile(path, "utf8").then((value) => value.trim()).catch(() => null);
}

function numericValue(value: string | null) {
  if (!value || value === "max") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseKeyValues(value: string | null) {
  if (!value) return {};
  return Object.fromEntries(value.split("\n").map((line) => {
    const [key, raw] = line.trim().split(/\s+/, 2);
    const parsed = Number(raw);
    return [key, Number.isFinite(parsed) ? parsed : raw];
  }));
}

export async function readRuntimeResourceMetrics() {
  const [memoryCurrent, memoryMax, memoryEvents, pidsCurrent] = await Promise.all([
    readText("/sys/fs/cgroup/memory.current"),
    readText("/sys/fs/cgroup/memory.max"),
    readText("/sys/fs/cgroup/memory.events"),
    readText("/sys/fs/cgroup/pids.current"),
  ]);
  const usage = process.memoryUsage();
  return {
    process: {
      pid: process.pid,
      uptimeSeconds: Math.floor(process.uptime()),
      rssBytes: usage.rss,
      heapTotalBytes: usage.heapTotal,
      heapUsedBytes: usage.heapUsed,
      externalBytes: usage.external,
      arrayBuffersBytes: usage.arrayBuffers,
    },
    cgroup: {
      memoryCurrentBytes: numericValue(memoryCurrent),
      memoryMaxBytes: numericValue(memoryMax),
      memoryEvents: parseKeyValues(memoryEvents),
      pidsCurrent: numericValue(pidsCurrent),
    },
  };
}
