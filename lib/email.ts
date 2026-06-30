export interface EmailSender {
  sendCode(to: string, code: string): Promise<void>;
  sendInvite(to: string, acceptUrl: string): Promise<void>;
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
  };
}

export function emailConfigured(): boolean {
  return !!(process.env.SENTOU_RESEND_KEY && process.env.SENTOU_EMAIL_FROM);
}
export function getSender(): EmailSender {
  if (emailConfigured()) return resendSender(process.env.SENTOU_RESEND_KEY!, process.env.SENTOU_EMAIL_FROM!);
  return consoleSender;
}
