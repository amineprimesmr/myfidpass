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
import membersProfileBonusRouter from "./members-profile-bonus.js";
import membersGuestClaimRouter from "./members-guest-claim.js";
import membersDeliveryReceiptRouter from "./members-delivery-receipt.js";
import membersRouter from "./members.js";
import assetsRouter from "./assets.js";
import publicAssetsRouter from "./public-assets.js";
import integrationRouter from "./integration.js";
import dashboardReferralRouter from "./dashboard-referral.js";
import dashboardDevPaymentRouter from "./dashboard-dev-payment.js";
import matchPredictionsPublicRouter from "./match-predictions-public.js";
import dashboardMatchPredictionsRouter from "./dashboard-match-predictions.js";

const slugRouter = Router({ mergeParams: true });

slugRouter.get("/", publicInfo);
slugRouter.use("/games/match_predictions", matchPredictionsPublicRouter);
slugRouter.use("/members/:memberId/match-predictions", matchPredictionsPublicRouter);
slugRouter.use("/games", gamesRouter);
slugRouter.get("/engagement-actions", engagementActionsHandler);
slugRouter.use("/engagement", engagementRouter);
slugRouter.post("/notify", notifyHandler);
slugRouter.use("/notifications", notificationsRouter);
slugRouter.use("/members", membersGuestClaimRouter);
slugRouter.use("/members", membersProfileBonusRouter);
slugRouter.use("/members", membersDeliveryReceiptRouter);
slugRouter.use("/members", membersRouter);
slugRouter.use("/dashboard/referral", dashboardReferralRouter);
slugRouter.use("/dashboard/dev-simulate-payment", dashboardDevPaymentRouter);
slugRouter.use("/dashboard/match-predictions", dashboardMatchPredictionsRouter);
slugRouter.use("/dashboard", dashboardRouter);
slugRouter.use("/integration", integrationRouter);
slugRouter.use("/public", publicAssetsRouter);
slugRouter.use("/", assetsRouter);
slugRouter.patch("/", updateHandler);

export default slugRouter;
