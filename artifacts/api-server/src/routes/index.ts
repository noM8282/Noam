import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import overviewRouter from "./overview";
import scriptsRouter from "./scripts";
import panelsRouter from "./panels";
import keysRouter from "./keys";
import serversRouter from "./servers";
import whitelistRouter from "./whitelist";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(overviewRouter);
router.use(scriptsRouter);
router.use(panelsRouter);
router.use(keysRouter);
router.use(serversRouter);
router.use(whitelistRouter);

export default router;
