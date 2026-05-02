export const getBaghdadDateString = (date: Date = new Date()): string => {
  return date.toLocaleDateString('en-CA', {
    timeZone: 'Asia/Baghdad'
  }); // "YYYY-MM-DD"
};

export const isGracePeriod = (): boolean => {
  const now = new Date();
  const baghdadHour = parseInt(
    now.toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Baghdad',
      hourCycle: "h23",
      hour: '2-digit'
    }).split(':')[0], 
    10
  );
  return baghdadHour < 2; // 0:00 - 1:59 AM
};

export const getEffectiveDate = (): string => {
  // If in grace period, return yesterday's date
  if (isGracePeriod()) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return getBaghdadDateString(yesterday);
  }
  return getBaghdadDateString();
};

export const daysBetween = (
  dateStr1: string, 
  dateStr2: string
): number => {
  const d1 = new Date(`${dateStr1}T12:00:00Z`);
  const d2 = new Date(`${dateStr2}T12:00:00Z`);
  const diff = d2.getTime() - d1.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};
