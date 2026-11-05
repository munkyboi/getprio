const CODES = new Set(['SERVICE_DURATION_EXCEEDS_STORE_HOURS','STORE_HOURS_UNAVAILABLE']);
function validInstant(value) {
  return typeof value==='string'&&value.length<=40&&Number.isFinite(Date.parse(value));
}
// Only approved bounded DTO fields may cross the HTTP error boundary. Never
// serialize arbitrary error properties or extra fields on the internal window.
function fields(error) {
  if(!CODES.has(error?.code))return {};
  const window=error.serviceHoursWindow;
  if(!window||!['open','closed','unavailable'].includes(window.status)||!validInstant(window.observedAt)
    ||typeof window.timezone!=='string'||!window.timezone.length||window.timezone.length>100
    ||!(window.opensAt===null||validInstant(window.opensAt))||!(window.closesAt===null||validInstant(window.closesAt))
    ||!(window.remainingWholeMinutes===null||(Number.isSafeInteger(window.remainingWholeMinutes)&&window.remainingWholeMinutes>=0&&window.remainingWholeMinutes<=2880))
    ||window.provisional!==true)return {};
  return {serviceHoursWindow:{status:window.status,observedAt:window.observedAt,timezone:window.timezone,
    opensAt:window.opensAt,closesAt:window.closesAt,remainingWholeMinutes:window.remainingWholeMinutes,provisional:true}};
}
module.exports={fields};
