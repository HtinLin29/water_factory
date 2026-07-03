export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function startOfDay(date: string): string {
  return `${date}T00:00:00.000Z`;
}

export function endOfDay(date: string): string {
  return `${date}T23:59:59.999Z`;
}

export function getWeekRange(referenceDate = new Date()): { start: string; end: string } {
  const d = new Date(referenceDate);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
  };
}

export function getMonthRange(referenceDate = new Date()): { start: string; end: string } {
  const d = new Date(referenceDate);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

/** Full calendar months older than 3 months from today */
export function getMonthsToArchive(): Date[] {
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const months: Date[] = [];
  const archiveBefore = new Date(now.getFullYear(), now.getMonth() - 3, 1);

  let cursor = new Date(archiveBefore.getFullYear(), archiveBefore.getMonth(), 1);
  while (cursor < cutoff) {
    months.push(new Date(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return months;
}

export function formatMonth(date: Date): string {
  return date.toISOString().split('T')[0].slice(0, 7) + '-01';
}

export function formatDisplayDate(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
