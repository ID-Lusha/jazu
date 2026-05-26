import { env } from "../env.js";

export async function sendMagicLinkEmail(email: string, link: string): Promise<void> {
  if (!env.RESEND_API_KEY || !env.FROM_EMAIL) {
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: [email],
      subject: "Вход в Chatera-like MVP",
      html: `<p>Ссылка для входа:</p><p><a href="${link}">${link}</a></p>`
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to send magic link email: ${response.status} ${await response.text()}`);
  }
}

export async function sendTelegramLead(chatId: string, text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    return;
  }

  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to send Telegram lead: ${response.status} ${await response.text()}`);
  }
}
