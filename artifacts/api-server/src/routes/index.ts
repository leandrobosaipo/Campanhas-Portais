import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sitesRouter from "./sites";
import clientsRouter from "./clients";
import agenciesRouter from "./agencies";
import campaignsRouter from "./campaigns";
import insertionsRouter from "./insertions";
import evidencesRouter from "./evidences";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sitesRouter);
router.use(clientsRouter);
router.use(agenciesRouter);
router.use(campaignsRouter);
router.use(insertionsRouter);
router.use(evidencesRouter);
router.use(dashboardRouter);

export default router;
