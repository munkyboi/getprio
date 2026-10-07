export function metrics(errors) {
  if (!errors.length) return { tickets: 0, maeMinutes: null, meanSignedErrorMinutes: null, withinFiveMinutesPercent: null };
  const round = (value) => Math.round(value * 100) / 100;
  return { tickets: errors.length,
    maeMinutes: round(errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length),
    meanSignedErrorMinutes: round(errors.reduce((sum, error) => sum + error, 0) / errors.length),
    withinFiveMinutesPercent: round(100 * errors.filter((error) => Math.abs(error) <= 5).length / errors.length) };
}
