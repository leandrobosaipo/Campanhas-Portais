type SshSite = { sshHost: string; sshPort: string; sshUser: string };

export function adrotateAdminSshArguments(site: SshSite, siteSigla: string, env: NodeJS.ProcessEnv = process.env) {
  const sigla = siteSigla.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const key = String(env[`ADOPS_${sigla}_SSH_KEY_PATH`] || (sigla !== "PERRENGUE" ? env.ADOPS_MULTISITE_SSH_KEY_PATH : "") || "").trim();
  return ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/tmp/adops-known-hosts", ...(key ? ["-i", key] : []), "-p", String(site.sshPort), `${site.sshUser}@${site.sshHost}`];
}

export function resolveAdrotateAdminTable(stdout: string) {
  const tables = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (tables.length !== 1 || !/^[A-Za-z0-9_]+adrotate$/.test(tables[0]!)) throw new Error("adrotate_admin_table_ambiguous");
  return tables[0]!;
}

export function buildAdrotateAdminReadSql(table: string, groupId: number, externalKey: string | null, mediaBasename: string | null) {
  if (!/^[A-Za-z0-9_]+adrotate$/.test(table) || !Number.isSafeInteger(groupId) || groupId <= 0) throw new Error("adrotate_admin_read_identity_invalid");
  const hex = (text: string) => `0x${Buffer.from(text).toString("hex")}`;
  const conditions: string[] = [];
  if (externalKey) conditions.push(`BINARY a.adops_external_key = ${hex(externalKey)}`);
  if (mediaBasename) conditions.push(`BINARY a.adops_media_basename = ${hex(mediaBasename)}`, `BINARY a.bannercode LIKE CONCAT(0x25, ${hex(mediaBasename)}, 0x25)`);
  if (!conditions.length) throw new Error("adrotate_admin_read_identity_missing");
  const links = table.replace(/adrotate$/, "adrotate_linkmeta");
  return `SELECT a.id, COALESCE(HEX(a.title),''), lm.\`group\`, COALESCE(a.adops_insertion_id,0), COALESCE(HEX(a.adops_external_key),''), COALESCE(HEX(a.adops_media_basename),'') FROM \`${table}\` a LEFT JOIN \`${links}\` lm ON lm.ad=a.id AND lm.user=0 WHERE lm.\`group\`=${groupId} AND (${conditions.join(" OR ")}) ORDER BY a.id DESC LIMIT 20`;
}

export function parseAdrotateAdminReadRows(stdout: string) {
  const decode = (value: string) => {
    if (!/^(?:[a-f0-9]{2})*$/i.test(value)) throw new Error("adrotate_admin_read_hex_invalid");
    return value ? Buffer.from(value, "hex").toString("utf8") : null;
  };
  return stdout.split(/\r?\n/).filter((line) => line.trim()).map((line) => {
    const values = line.split("\t");
    if (values.length !== 6 || !/^\d+$/.test(values[0]!) || !/^\d+$/.test(values[2]!) || !/^\d+$/.test(values[3]!)) throw new Error("adrotate_admin_read_columns_invalid");
    return { id: Number(values[0]), title: decode(values[1]!), group_id: Number(values[2]), adops_insertion_id: Number(values[3]) || null, adops_external_key: decode(values[4]!), adops_media_basename: decode(values[5]!) };
  });
}
