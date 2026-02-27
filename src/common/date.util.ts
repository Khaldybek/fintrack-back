/** Current month range in timezone as YYYY-MM-DD */
export function getCurrentMonthRange(timezone: string): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const dateFrom = `${y}-${month}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const dateTo = `${y}-${month}-${String(lastDay).padStart(2, '0')}`;
  return { dateFrom, dateTo };
}
