import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, sitesTable } from "@workspace/db";
import {
  CreateSiteBody,
  GetSiteParams,
  GetSiteResponse,
  UpdateSiteParams,
  UpdateSiteBody,
  UpdateSiteResponse,
  ListSitesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serializeSite(site: typeof sitesTable.$inferSelect) {
  return {
    ...site,
    createdAt: site.createdAt.toISOString(),
  };
}

router.get("/sites", async (_req, res): Promise<void> => {
  const sites = await db.select().from(sitesTable).orderBy(sitesTable.nome);
  res.json(ListSitesResponse.parse(sites.map(serializeSite)));
});

router.post("/sites", async (req, res): Promise<void> => {
  const parsed = CreateSiteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [site] = await db.insert(sitesTable).values(parsed.data).returning();
  res.status(201).json(GetSiteResponse.parse(serializeSite(site)));
});

router.get("/sites/:id", async (req, res): Promise<void> => {
  const params = GetSiteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [site] = await db.select().from(sitesTable).where(eq(sitesTable.id, params.data.id));
  if (!site) {
    res.status(404).json({ error: "Site not found" });
    return;
  }
  res.json(GetSiteResponse.parse(serializeSite(site)));
});

router.patch("/sites/:id", async (req, res): Promise<void> => {
  const params = UpdateSiteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateSiteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.nome != null) updateData.nome = parsed.data.nome;
  if (parsed.data.sigla != null) updateData.sigla = parsed.data.sigla;
  if (parsed.data.dominio !== undefined) updateData.dominio = parsed.data.dominio;
  if (parsed.data.siteUrl !== undefined) updateData.siteUrl = parsed.data.siteUrl;
  if (parsed.data.artigoExemploUrl !== undefined) updateData.artigoExemploUrl = parsed.data.artigoExemploUrl;
  if (parsed.data.logoUrl !== undefined) updateData.logoUrl = parsed.data.logoUrl;
  if (parsed.data.serverLabel !== undefined) updateData.serverLabel = parsed.data.serverLabel;
  if (parsed.data.sshHost !== undefined) updateData.sshHost = parsed.data.sshHost;
  if (parsed.data.sshPort !== undefined) updateData.sshPort = parsed.data.sshPort;
  if (parsed.data.sshUser !== undefined) updateData.sshUser = parsed.data.sshUser;
  if (parsed.data.webrootPath !== undefined) updateData.webrootPath = parsed.data.webrootPath;
  if (parsed.data.wpPath !== undefined) updateData.wpPath = parsed.data.wpPath;
  if (parsed.data.wpCliPath !== undefined) updateData.wpCliPath = parsed.data.wpCliPath;
  if (parsed.data.phpBin !== undefined) updateData.phpBin = parsed.data.phpBin;
  if (parsed.data.tablePrefix !== undefined) updateData.tablePrefix = parsed.data.tablePrefix;
  if (parsed.data.adrotateVersao !== undefined) updateData.adrotateVersao = parsed.data.adrotateVersao;
  if (parsed.data.cloudflareZoneId !== undefined) updateData.cloudflareZoneId = parsed.data.cloudflareZoneId;
  if (parsed.data.cloudflareProjectName !== undefined) updateData.cloudflareProjectName = parsed.data.cloudflareProjectName;
  if (parsed.data.pagesSubdomain !== undefined) updateData.pagesSubdomain = parsed.data.pagesSubdomain;
  if (parsed.data.spacesBucket !== undefined) updateData.spacesBucket = parsed.data.spacesBucket;
  if (parsed.data.spacesBasePath !== undefined) updateData.spacesBasePath = parsed.data.spacesBasePath;
  if (parsed.data.maintenanceWorkspacePath !== undefined) updateData.maintenanceWorkspacePath = parsed.data.maintenanceWorkspacePath;
  if (parsed.data.deploymentNotes !== undefined) updateData.deploymentNotes = parsed.data.deploymentNotes;
  if (parsed.data.ativo != null) updateData.ativo = parsed.data.ativo;

  const [site] = await db.update(sitesTable).set(updateData).where(eq(sitesTable.id, params.data.id)).returning();
  if (!site) {
    res.status(404).json({ error: "Site not found" });
    return;
  }
  res.json(UpdateSiteResponse.parse(serializeSite(site)));
});

export default router;
