export interface EmailSender {
  sendCode(to: string, code: string): Promise<void>;
}

const consoleSender: EmailSender = {
  async sendCode(to, code) {
    console.log(`[sentou] verification code for ${to}: ${code}`);
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
  };
}

export function emailConfigured(): boolean {
  return !!(process.env.SENTOU_RESEND_KEY && process.env.SENTOU_EMAIL_FROM);
}
export function getSender(): EmailSender {
  if (emailConfigured()) return resendSender(process.env.SENTOU_RESEND_KEY!, process.env.SENTOU_EMAIL_FROM!);
  return consoleSender;
}
