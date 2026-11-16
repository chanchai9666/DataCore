export interface DateTimeInfo {
  isDateTime: true;
  date: Date;
  localFormatted: string;
  utcFormatted: string;
  relativeFormatted: string;
}

export interface ImageInfo {
  isImage: true;
  src: string;
}

export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);

  if (Math.abs(diffSec) < 60) {
    return 'just now';
  }
  if (Math.abs(diffMin) < 60) {
    return diffMin > 0 ? `${diffMin} minute${diffMin === 1 ? '' : 's'} ago` : `in ${Math.abs(diffMin)} minutes`;
  }
  if (Math.abs(diffHour) < 24) {
    return diffHour > 0 ? `${diffHour} hour${diffHour === 1 ? '' : 's'} ago` : `in ${Math.abs(diffHour)} hours`;
  }
  return diffDay > 0 ? `${diffDay} day${diffDay === 1 ? '' : 's'} ago` : `in ${Math.abs(diffDay)} days`;
}

export function detectDateTime(val: unknown): DateTimeInfo | null {
  if (val === null || val === undefined) return null;

  let d: Date | null = null;

  if (typeof val === 'number') {
    // Check for unix seconds (10 digits ~ 1e9 to 2e9)
    if (val >= 1000000000 && val <= 2500000000) {
      d = new Date(val * 1000);
    }
    // Check for unix milliseconds (13 digits ~ 1e12 to 2.5e12)
    else if (val >= 1000000000000 && val <= 2500000000000) {
      d = new Date(val);
    }
  } else if (typeof val === 'string') {
    const s = val.trim();
    // Match ISO 8601 or common SQL datetime strings
    // e.g. 2026-11-16T09:00:00Z, 2026-11-16 09:00:00, 2026-11-16T09:00:00.123+07:00
    const isIsoOrSqlDate =
      /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(s);

    if (isIsoOrSqlDate) {
      const parsed = Date.parse(s.replace(' ', 'T'));
      if (!isNaN(parsed)) {
        d = new Date(parsed);
      }
    }
  }

  if (!d || isNaN(d.getTime())) {
    return null;
  }

  return {
    isDateTime: true,
    date: d,
    localFormatted: d.toLocaleString(),
    utcFormatted: d.toISOString(),
    relativeFormatted: formatRelativeTime(d),
  };
}

export function detectImage(val: unknown): ImageInfo | null {
  if (typeof val !== 'string') return null;
  const s = val.trim();

  // Check base64 data URI
  if (/^data:image\/(?:png|jpeg|jpg|gif|svg\+xml|webp|bmp);base64,/i.test(s)) {
    return { isImage: true, src: s };
  }

  // Check image url
  if (/^https?:\/\/.*\.(?:png|jpeg|jpg|gif|svg|webp|bmp)(?:\?.*)?$/i.test(s)) {
    return { isImage: true, src: s };
  }

  return null;
}
