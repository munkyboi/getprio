type BusinessHour = {
  weekday: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
};

function toMinutes(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

export function getMaxBookableHours(hours: BusinessHour[], weekday: number) {
  const businessHours = hours.find((hour) => hour.weekday === weekday);
  if (!businessHours || businessHours.isClosed || !businessHours.opensAt || !businessHours.closesAt) {
    return 24;
  }

  if (businessHours.opensAt === businessHours.closesAt) {
    return 24;
  }

  const opensAtMinutes = toMinutes(businessHours.opensAt);
  const closesAtMinutes = toMinutes(businessHours.closesAt);
  const durationMinutes = closesAtMinutes > opensAtMinutes
    ? closesAtMinutes - opensAtMinutes
    : closesAtMinutes + 24 * 60 - opensAtMinutes;

  return Math.max(1, Math.min(24, Math.floor(durationMinutes / 60)));
}

export function getWeeklyAvailabilityDefaults(hours: BusinessHour[], weekday: number) {
  const businessHours = hours.find((hour) => hour.weekday === weekday);
  if (!businessHours || businessHours.isClosed || !businessHours.opensAt || !businessHours.closesAt) {
    return { startsAt: "", endsAt: "", endsNextDay: false };
  }

  if (businessHours.opensAt === businessHours.closesAt) {
    return { startsAt: "00:00", endsAt: "23:59", endsNextDay: false };
  }

  return {
    startsAt: businessHours.opensAt,
    endsAt: businessHours.closesAt,
    endsNextDay: toMinutes(businessHours.closesAt) < toMinutes(businessHours.opensAt)
  };
}
