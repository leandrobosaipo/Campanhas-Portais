const TIME_ZONE = "America/Cuiaba";
const WINDOWS = ["08:30", "18:45", "19:15", "19:45", "20:15", "20:45", "21:15", "21:45", "22:00"];

function previousDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

export function resolveDailyPrintAlertDecision(now = new Date(), catchUpMinutes = 5) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const today = `${values.year}-${values.month}-${values.day}`;
  const currentMinutes = Number(values.hour) * 60 + Number(values.minute);
  const localTime = [...WINDOWS].reverse().find((window) => {
    const [hour, minute] = window.split(":").map(Number);
    const delta = currentMinutes - (hour * 60 + minute);
    return delta >= 0 && delta < catchUpMinutes;
  }) ?? null;
  const escalation = localTime === "08:30";
  return {
    due: localTime !== null,
    localTime,
    escalation,
    targetDate: escalation ? previousDate(today) : today,
    timezone: TIME_ZONE,
  };
}
