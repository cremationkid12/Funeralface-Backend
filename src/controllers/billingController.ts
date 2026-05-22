import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/authMiddleware";
import type { BillingService } from "../services/billingService";

function checkoutUrls(): { successUrl: string; cancelUrl: string } | null {
  const successUrl = process.env.STRIPE_CHECKOUT_SUCCESS_URL?.trim();
  const cancelUrl = process.env.STRIPE_CHECKOUT_CANCEL_URL?.trim();
  if (!successUrl || !cancelUrl) return null;
  return { successUrl, cancelUrl };
}

function portalReturnUrl(): string | null {
  return process.env.STRIPE_PORTAL_RETURN_URL?.trim() || null;
}

export async function getSubscription(
  req: AuthenticatedRequest,
  res: Response,
  billingService: BillingService,
): Promise<void> {
  const orgId = req.auth?.orgId;
  if (!orgId) {
    res.status(401).json({ code: "unauthorized", message: "Authentication is required." });
    return;
  }

  const view = await billingService.getSubscriptionView(orgId);
  res.status(200).json(view);
}

export async function postCheckoutSession(
  req: AuthenticatedRequest,
  res: Response,
  billingService: BillingService,
): Promise<void> {
  const orgId = req.auth?.orgId;
  if (!orgId) {
    res.status(401).json({ code: "unauthorized", message: "Authentication is required." });
    return;
  }

  const urls = checkoutUrls();
  if (!urls) {
    res.status(503).json({
      code: "billing_not_configured",
      message: "Checkout URLs are not configured on the server.",
    });
    return;
  }

  try {
    const session = await billingService.createCheckoutSession({
      orgId,
      customerEmail: req.auth?.email,
      successUrl: urls.successUrl,
      cancelUrl: urls.cancelUrl,
    });
    res.status(200).json(session);
  } catch (error) {
    const code = (error as Error & { code?: string }).code;
    if (code === "subscription_exists") {
      res.status(409).json({
        code: "subscription_exists",
        message: "This organization already has an active subscription.",
      });
      return;
    }
    console.error("[billing] checkout session failed:", error);
    res.status(500).json({
      code: "billing_error",
      message: "Unable to start checkout. Please try again.",
    });
  }
}

export async function postPortalSession(
  req: AuthenticatedRequest,
  res: Response,
  billingService: BillingService,
): Promise<void> {
  const orgId = req.auth?.orgId;
  if (!orgId) {
    res.status(401).json({ code: "unauthorized", message: "Authentication is required." });
    return;
  }

  const returnUrl = portalReturnUrl();
  if (!returnUrl) {
    res.status(503).json({
      code: "billing_not_configured",
      message: "Billing portal return URL is not configured on the server.",
    });
    return;
  }

  try {
    const session = await billingService.createPortalSession({ orgId, returnUrl });
    res.status(200).json(session);
  } catch (error) {
    const code = (error as Error & { code?: string }).code;
    if (code === "billing_customer_missing") {
      res.status(404).json({
        code: "billing_customer_missing",
        message: "Subscribe first before managing billing.",
      });
      return;
    }
    console.error("[billing] portal session failed:", error);
    res.status(500).json({
      code: "billing_error",
      message: "Unable to open billing portal. Please try again.",
    });
  }
}
