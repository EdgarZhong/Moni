import { format, parse, parseISO, isValid } from 'date-fns';

const DAY_PATTERN = 'yyyy-MM-dd';
const DATE_TIME_PATTERN = 'yyyy-MM-dd HH:mm:ss';

export function normalizeToDateKey(value: string | Date): string {
  if (value instanceof Date) {
    return format(value, DAY_PATTERN);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsedByPattern = parse(trimmed, DATE_TIME_PATTERN, new Date());
  if (isValid(parsedByPattern)) {
    return format(parsedByPattern, DAY_PATTERN);
  }

  const parsedByIso = parseISO(trimmed);
  if (isValid(parsedByIso)) {
    return format(parsedByIso, DAY_PATTERN);
  }

  return '';
}

export function uniqueSortedDateKeys(values: Array<string | Date>): string[] {
  return Array.from(
    new Set(
      values
        .map(normalizeToDateKey)
        .filter(Boolean)
    )
  ).sort();
}
