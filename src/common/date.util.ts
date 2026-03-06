/** Current month range in timezone as YYYY-MM-DD. Falls back to UTC on invalid timezone. */
export function getCurrentMonthRange(timezone: string): { dateFrom: string; dateTo: string } {
  const tz = timezone && timezone.trim() ? timezone.trim() : 'UTC';
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    if (!year || !month) return getCurrentMonthRangeUTC();
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    const dateFrom = `${y}-${month}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const dateTo = `${y}-${month}-${String(lastDay).padStart(2, '0')}`;
    return { dateFrom, dateTo };
  } catch {
    return getCurrentMonthRangeUTC();
  }
}

function getCurrentMonthRangeUTC(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const month = String(m).padStart(2, '0');
  const dateFrom = `${y}-${month}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dateTo = `${y}-${month}-${String(lastDay).padStart(2, '0')}`;
  return { dateFrom, dateTo };
}

/** Today in timezone as YYYY-MM-DD (for relative date resolution in AI). */
export function getTodayInTimezone(timezone: string): string {
  const tz = timezone?.trim() || 'UTC';
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(new Date());
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // fallback
  }
  const now = new Date();
  return now.toISOString().slice(0, 10);
}
