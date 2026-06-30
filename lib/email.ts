export interface EmailSender {
  sendCode(to: string, code: string): Promise<void>;
  sendInvite(to: string, acceptUrl: string): Promise<void>;
  sendOpenNotification(
    to: string,
    data: { linkTitle: string | null; viewer: string; openedAt: string },
  ): Promise<void>;
}

// Escape values interpolated into notification email HTML. The link title and viewer address
// are user-controlled, so they must not be injected into the markup unescaped.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const consoleSender: EmailSender = {
  async sendCode(to, code) {
    // Never write a recipient address or a live OTP to stdout on a real deploy: production
    // logs are PII + a credential. Publish refuses verifyEmail links without a sender in
    // production, so reaching here in prod is a misconfiguration; warn without leaking.
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[sentou] no email sender configured; cannot deliver a verification code. " +
          "Set SENTOU_RESEND_KEY + SENTOU_EMAIL_FROM.",
      );
      return;
    }
    console.log(`[sentou] verification code for ${to}: ${code}`);
  },
  async sendInvite(to, acceptUrl) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[sentou] no email sender configured; cannot deliver invitation. " +
          "Set SENTOU_RESEND_KEY + SENTOU_EMAIL_FROM.",
      );
      return;
    }
    console.log(`[sentou] invitation for ${to}: ${acceptUrl}`);
  },
  async sendOpenNotification(to, { linkTitle, viewer, openedAt }) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[sentou] no email sender configured; cannot deliver open notification. " +
          "Set SENTOU_RESEND_KEY + SENTOU_EMAIL_FROM.",
      );
      return;
    }
    const title = linkTitle ?? "(untitled)";
    console.log(`[sentou] open notification for ${to}: "${title}" opened by ${viewer} at ${openedAt}`);
  },
};

function resendSender(apiKey: string, from: string): EmailSender {
  return {
    async sendCode(to, code) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from, to, subject: "Your Sentou access code",
          html: `<p>Your one-time code is <b>${code}</b>. It expires in 10 minutes.</p>`,
        }),
      });
      if (!res.ok) throw new Error(`email send failed: ${res.status}`);
    },
    async sendInvite(to, acceptUrl) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from, to, subject: "You've been invited to Sentou",
          html:
            `<p>You have been invited to join Sentou. Your invitation expires in 48 hours.</p>` +
            `<p><a href="${acceptUrl}">Accept invitation</a></p>`,
        }),
      });
      if (!res.ok) throw new Error(`invitation email send failed: ${res.status}`);
    },
    async sendOpenNotification(to, { linkTitle, viewer, openedAt }) {
      const title = linkTitle ?? "(untitled)";
      const safeTitle = escapeHtml(title);
      const safeViewer = escapeHtml(viewer);
      const openedDate = new Date(openedAt).toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", timeZoneName: "short",
      });
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from, to,
          subject: `"${title}" was opened`,
          html:
            `<div style="font-family:sans-serif;color:#1a1b26;background:#f9f9fb;padding:32px">` +
            `<p style="margin:0 0 8px;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:#565f89;font-family:monospace">Sentou open alert</p>` +
            `<h1 style="margin:0 0 24px;font-size:24px;font-weight:900;color:#1a1b26">"${safeTitle}"<span style="color:#2d8f3e">.</span></h1>` +
            `<p style="margin:0 0 8px;font-size:15px;color:#1a1b26">Your link was opened.</p>` +
            `<table style="border-collapse:collapse;width:100%;margin-top:16px">` +
            `<tr><td style="padding:10px 0;border-top:1px solid #e4e7f0;font-size:12px;color:#565f89;font-family:monospace;text-transform:uppercase;letter-spacing:0.15em">Viewer</td>` +
            `<td style="padding:10px 0;border-top:1px solid #e4e7f0;font-size:14px;color:#1a1b26;text-align:right">${safeViewer}</td></tr>` +
            `<tr><td style="padding:10px 0;border-top:1px solid #e4e7f0;font-size:12px;color:#565f89;font-family:monospace;text-transform:uppercase;letter-spacing:0.15em">Opened</td>` +
            `<td style="padding:10px 0;border-top:1px solid #e4e7f0;font-size:14px;color:#1a1b26;text-align:right">${openedDate}</td></tr>` +
            `</table>` +
            `</div>`,
        }),
      });
      if (!res.ok) throw new Error(`open notification email send failed: ${res.status}`);
    },
  };
}

export function emailConfigured(): boolean {
  return !!(process.env.SENTOU_RESEND_KEY && process.env.SENTOU_EMAIL_FROM);
}
export function getSender(): EmailSender {
  if (emailConfigured()) return resendSender(process.env.SENTOU_RESEND_KEY!, process.env.SENTOU_EMAIL_FROM!);
  return consoleSender;
}
