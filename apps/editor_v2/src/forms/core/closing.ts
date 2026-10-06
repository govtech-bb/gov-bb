export function closingWorks(iso: string) {
  const match = iso.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-](\d{2}):(\d{2}))$/,
  );

  if (!match) return false;
  const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] = match;

  const y = Number(year),
    m = Number(month),
    d = Number(day);

  const days = [
    31,
    y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return (
    m >= 1 &&
    m <= 12 &&
    d >= 1 &&
    d <= days[m - 1]! &&
    Number(hour) < 24 &&
    Number(minute) < 60 &&
    Number(second ?? 0) < 60 &&
    Number(offsetHour ?? 0) < 24 &&
    Number(offsetMinute ?? 0) < 60 &&
    !Number.isNaN(Date.parse(iso))
  );
}
