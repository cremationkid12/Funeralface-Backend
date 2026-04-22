import sendgridMail from "@sendgrid/mail";

export type InviteByEmailInput = {
  email: string;
  senderName?: string | null;
  senderEmail?: string | null;
  inviteToken?: string;
  orgId?: string;
  invitedByUserId?: string;
};

export class InviteNotConfiguredError extends Error {
  override name = "InviteNotConfiguredError";

  constructor() {
    super(
      "Invite email is not configured (missing SENDGRID_API_KEY, INVITE_FROM_EMAIL, or INVITE_SIGNUP_URL).",
    );
  }
}

function buildInviteLink(baseUrl: string, email: string, inviteToken?: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("email", email);
  url.searchParams.set("invited", "1");
  const token = inviteToken?.trim();
  if (token) {
    const invitePathPattern = /\/invite\/?$/i;
    if (invitePathPattern.test(url.pathname)) {
      url.pathname = `${url.pathname.replace(/\/+$/, "")}/${encodeURIComponent(token)}`;
    } else {
      url.searchParams.set("invite_token", token);
    }
  }
  return url.toString();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildInviteEmailHtml(params: {
  inviteLink: string;
  fromName: string;
  inviteeEmail: string;
  senderLabel: string;
}): string {
  const safeInviteLink = escapeHtml(params.inviteLink);
  const safeFromName = escapeHtml(params.fromName);
  const safeInviteeEmail = escapeHtml(params.inviteeEmail);
  const safeSenderLabel = escapeHtml(params.senderLabel);
  const year = new Date().getFullYear();

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>You're invited to ${safeFromName}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#F5F0EB;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      You are invited to join ${safeFromName}. Click to set up your account.
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F5F0EB;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#FFFFFF;border:1px solid #E0DAD4;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:#2D6A4F;padding:24px 28px;">
                <h1 style="margin:0;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:1.3;">
                  You're invited
                </h1>
                <p style="margin:8px 0 0 0;color:#E8F5EE;font-family:Arial,Helvetica,sans-serif;font-size:14px;">
                  Join your team on ${safeFromName}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 14px 0;color:#1A1A1A;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;">
                  Hello,
                </p>
                <p style="margin:0 0 14px 0;color:#1A1A1A;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;">
                  You have been invited to access <strong>${safeFromName}</strong>.
                </p>
                <p style="margin:0 0 14px 0;color:#1A1A1A;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;">
                  Sent by: <strong>${safeSenderLabel}</strong>
                </p>
                <p style="margin:0 0 24px 0;color:#1A1A1A;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;">
                  Click the button below to create your account and get started.
                </p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" style="border-radius:12px;background:#E07B2A;">
                      <a href="${safeInviteLink}" target="_blank" style="display:inline-block;padding:14px 22px;color:#FFFFFF;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;">
                        Accept Invitation
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:22px 0 0 0;color:#888888;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;">
                  If the button does not work, copy and paste this URL into your browser:
                </p>
                <p style="margin:8px 0 0 0;word-break:break-all;">
                  <a href="${safeInviteLink}" target="_blank" style="color:#2D6A4F;font-family:Arial,Helvetica,sans-serif;font-size:13px;">
                    ${safeInviteLink}
                  </a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;border-top:1px solid #E0DAD4;background:#FFFDFB;">
                <p style="margin:0;color:#888888;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;">
                  If you did not expect this invitation, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:14px 0 0 0;color:#888888;font-family:Arial,Helvetica,sans-serif;font-size:12px;">
            © ${year} ${safeFromName}
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function formatSenderLabel(senderName?: string | null, senderEmail?: string | null): string {
  const name = senderName?.trim() ?? "";
  const email = senderEmail?.trim() ?? "";
  if (name && email) return `${name} (${email})`;
  if (name) return name;
  if (email) return email;
  return "EverRoute Funeral Admin";
}

function getProviderErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Invite provider request failed.";
  }
  const maybeResponse = (error as { response?: { body?: unknown } }).response;
  const body = maybeResponse?.body as
    | {
        errors?: Array<{ message?: string }>;
      }
    | undefined;
  const providerMessage = body?.errors?.[0]?.message;
  return providerMessage || error.message || "Invite provider request failed.";
}

export async function defaultInviteUserByEmail(input: InviteByEmailInput): Promise<void> {
  const email = input.email.trim();
  const apiKey = process.env.SENDGRID_API_KEY?.trim();
  const fromEmail = process.env.INVITE_FROM_EMAIL?.trim();
  const fromName = process.env.INVITE_FROM_NAME?.trim() || "EverRoute Funeral";
  const inviteSignupUrl = process.env.INVITE_SIGNUP_URL?.trim();
  const senderLabel = formatSenderLabel(input.senderName, input.senderEmail);

  if (!apiKey || !fromEmail || !inviteSignupUrl) {
    throw new InviteNotConfiguredError();
  }

  let inviteLink: string;
  try {
    inviteLink = buildInviteLink(inviteSignupUrl, email, input.inviteToken);
  } catch {
    throw new InviteNotConfiguredError();
  }

  sendgridMail.setApiKey(apiKey);

  const textBody = [
    `You are invited to join ${fromName}.`,
    "",
    `${email} has been invited to access ${fromName}.`,
    `Sent by: ${senderLabel}`,
    "",
    `Accept invitation: ${inviteLink}`,
    "",
    "If you did not expect this invite, you can ignore this email.",
  ].join("\n");

  const htmlBody = buildInviteEmailHtml({
    inviteLink,
    fromName,
    inviteeEmail: email,
    senderLabel,
  });

  try {
    await sendgridMail.send({
      to: email,
      from: { email: fromEmail, name: fromName },
      subject: `Invitation to join ${fromName}`,
      text: textBody,
      html: htmlBody,
    });
  } catch (error) {
    const err = new Error(getProviderErrorMessage(error));
    Object.assign(err, { name: "SendGridInviteError" });
    throw err;
  }
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
