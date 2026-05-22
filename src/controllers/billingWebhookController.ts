import type { Request, Response } from "express";
import type { BillingService } from "../services/billingService";

export async function postBillingWebhook(
  req: Request,
  res: Response,
  billingService: BillingService,
): Promise<void> {
  const signature = req.headers["stripe-signature"];
  if (!signature || typeof signature !== "string") {
    res.status(400).json({
      code: "invalid_request",
      message: "Missing Stripe-Signature header.",
    });
    return;
  }

  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody)) {
    res.status(400).json({
      code: "invalid_request",
      message: "Webhook body must be raw bytes.",
    });
    return;
  }

  try {
    await billingService.handleWebhookEvent(rawBody, signature);
    res.status(200).json({ received: true });
  } catch (error) {
    console.error("[billing] webhook failed:", error);
    res.status(400).json({
      code: "webhook_error",
      message: "Webhook signature verification or processing failed.",
    });
  }
}
