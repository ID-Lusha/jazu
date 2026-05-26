/**
 * Telegram notification helper, изолированный от env api/jobs — токен
 * передаётся параметром, чтобы пакет мог использоваться из любого сервиса.
 *
 * Не бросает наружу: ошибки доставки телеграма не должны валить
 * основной inbound-pipeline. Просто пишем в console.error.
 */
export async function sendTelegramLead(
  botToken: string | undefined,
  chatId: string,
  text: string
): Promise<void> {
  if (!botToken) return;

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true
      })
    });
    if (!response.ok) {
      console.error(
        "[wa-pipeline] telegram lead failed:",
        response.status,
        await response.text().catch(() => "")
      );
    }
  } catch (err) {
    console.error("[wa-pipeline] telegram lead error:", err instanceof Error ? err.message : err);
  }
}
