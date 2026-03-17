/**
 * Routeur pour /:slug — compose tous les sous-routeurs et routes à la racine du slug.
 * Référence : REFONTE-REGLES.md — découpage businesses.
 */
import { Router } from "express";
import { publicInfo, gamesRouter } from "./public.js";
import { updateHandler } from "./create.js";
import dashboardRouter from "./dashboard.js";
import { engagementActionsHandler, engagementRouter } from "./engagement.js";
import { notifyHandler, notificationsRouter } from "./notifications.js";
import membersRouter from "./members.js";
import integrationRouter from "./integration.js";
import assetsRouter from "./assets.js";
import publicAssetsRouter from "./public-assets.js";

const slugRouter = Router();

slugRouter.get("/", publicInfo);
slugRouter.use("/games", gamesRouter);
slugRouter.get("/engagement-actions", engagementActionsHandler);
slugRouter.use("/engagement", engagementRouter);
slugRouter.post("/notify", notifyHandler);
slugRouter.use("/notifications", notificationsRouter);
slugRouter.use("/members", membersRouter);
slugRouter.use("/dashboard", dashboardRouter);
slugRouter.use("/integration", integrationRouter);
slugRouter.use("/public", publicAssetsRouter);
slugRouter.use("/", assetsRouter);
slugRouter.patch("/", updateHandler);

export default slugRouter;
