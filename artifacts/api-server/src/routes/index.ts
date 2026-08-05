import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sitesRouter from "./sites";
import clientsRouter from "./clients";
import agenciesRouter from "./agencies";
import campaignsRouter from "./campaigns";
import insertionsRouter from "./insertions";
import evidencesRouter from "./evidences";
import dashboardRouter from "./dashboard";
import syncRouter from "./sync";
import captureRulesRouter from "./capture-rules";
import auditChecklistsRouter from "./audit-checklists";
import campaignOperationsRouter from "./campaign-operations";
import campaignFulfillmentsRouter from "./campaign-fulfillments";
import opsRouter from "./ops";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sitesRouter);
router.use(clientsRouter);
router.use(agenciesRouter);
router.use(campaignsRouter);
router.use(insertionsRouter);
router.use(evidencesRouter);
router.use(dashboardRouter);
router.use(syncRouter);
router.use(captureRulesRouter);
router.use(auditChecklistsRouter);
router.use(campaignOperationsRouter);
router.use(campaignFulfillmentsRouter);
router.use(opsRouter);

export default router;
