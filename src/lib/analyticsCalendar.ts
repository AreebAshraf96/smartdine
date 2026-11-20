import "server-only";

const DAY_MS = 86_400_000;
const DEFAULT_ZONE = "Asia/Karachi";

export function analyticsCalendar(restaurantId: string) {
  const configured: unknown = JSON.parse(process.env.SMARTDINE_RESTAURANT_TIME_ZONES ?? "{}");
  if (!configured || typeof configured !== "object" || Array.isArray(configured)) {
    throw new Error("SMARTDINE_RESTAURANT_TIME_ZONES must be a JSON object");
  }
  const zones = configured as Record<string, unknown>;
  const timeZone = Object.hasOwn(zones, restaurantId) ? zones[restaurantId] : DEFAULT_ZONE;
  if (typeof timeZone !== "string") throw new Error("Restaurant time zone must be a string");

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone, weekday: "short", hour: "2-digit", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
  });

  function timeParts(value: string | number) {
    const parts = formatter.formatToParts(new Date(value));
    const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
    return { day: get("weekday"), hour: Number(get("hour")), date: `${get("year")}-${get("month")}-${get("day")}` };
  }

  function localDayStart(date: string) {
    const utc = Date.parse(`${date}T00:00:00Z`);
    // Find the first instant of the requested local date, including when DST skips midnight.
    let low = utc - DAY_MS;
    let high = utc + DAY_MS;
    while (low < high) {
      const mid = low + Math.floor((high - low) / 2);
      if (timeParts(mid).date < date) low = mid + 1;
      else high = mid;
    }
    return new Date(low).toISOString();
  }

  return { timeZone, timeParts, localDayStart };
}

export function shiftCalendarDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}
