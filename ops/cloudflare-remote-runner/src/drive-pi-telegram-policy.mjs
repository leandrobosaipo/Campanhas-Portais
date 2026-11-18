export async function deliverDrivePiTelegram(summary, {
  sendTelegram = true,
  botUrl = "",
  apiToken = "",
  fetchImpl = fetch,
} = {}) {
  if (sendTelegram === false) return { skipped: "sendTelegram=false" };
  if (!botUrl) return { skipped: "ADOPS_TELEGRAM_BOT_URL ausente" };
  const response = await fetchImpl(`${botUrl}/ops/drive-pi-event`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify(summary),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.details || payload?.error || `Telegram drive-pi-event falhou: ${response.status}`);
  return payload;
}
