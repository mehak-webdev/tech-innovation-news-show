/**
 * Asia/Kolkata (IST) Timezone Utilities
 *
 * Ensures all daily episode business dates, scheduling transitions, and display
 * timestamps follow Indian Standard Time (UTC+05:30) consistently regardless of
 * server environment or local hosting timezone.
 */

export const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Returns the calendar date in Asia/Kolkata timezone formatted as "YYYY-MM-DD".
 *
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} e.g. "2026-10-28"
 */
export function getISTDateString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date provided to getISTDateString: ${date}`);
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  return formatter.format(d);
}

/**
 * Returns a human-friendly formatted date in Asia/Kolkata timezone.
 *
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} e.g. "Wednesday, October 28, 2026"
 */
export function getISTFormattedDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date provided to getISTFormattedDate: ${date}`);
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: IST_TIMEZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return formatter.format(d);
}

/**
 * Returns time string in Asia/Kolkata timezone formatted as "HH:mm:ss".
 *
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} e.g. "18:30:00"
 */
export function getISTTimeString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date provided to getISTTimeString: ${date}`);
  }

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  return formatter.format(d);
}

/**
 * Checks if two dates fall on the same calendar day in Asia/Kolkata.
 *
 * @param {Date|string|number} date1
 * @param {Date|string|number} date2
 * @returns {boolean}
 */
export function isSameISTDay(date1, date2) {
  return getISTDateString(date1) === getISTDateString(date2);
}

/**
 * Converts a UTC schedule to corresponding IST time or vice-versa.
 * Useful for Render Cron Job documentation (Render crons run in UTC).
 *
 * @param {number} istHour - 0 to 23
 * @param {number} istMinute - 0 to 59
 * @returns {{ utcHour: number, utcMinute: number, utcCronString: string }}
 */
export function calculateUTCCronForIST(istHour = 18, istMinute = 0) {
  // IST is UTC + 5:30. Subtract 5h 30m to get UTC.
  let totalMinutes = istHour * 60 + istMinute - 330;
  if (totalMinutes < 0) {
    totalMinutes += 24 * 60;
  }
  const utcHour = Math.floor(totalMinutes / 60);
  const utcMinute = totalMinutes % 60;

  return {
    utcHour,
    utcMinute,
    utcCronString: `${utcMinute} ${utcHour} * * *`
  };
}

