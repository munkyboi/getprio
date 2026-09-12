const { randomUUID } = require('node:crypto');
const db = require('../config/db');
const users = require('../repositories/users');
const locations = require('../repositories/tenantMembershipLocations');
const { buildTemplateEmail, previewEmail: buildEmail } = require('./staffAccessResendTemplates');

function accessState(user, tenantId, locationIds = []) {
  const membership = user?.tenantMemberships?.find(m => String(m.tenantId) === String(tenantId));
  if (!membership) return null;
  return { role: membership.role, active: membership.isActive !== false,
    locations: [...new Set(locationIds.map(String))].sort((left, right) => left.localeCompare(right)) };
}

function createStaffAccessEmailService({ database = db, userRepository = users, locationRepository = locations, uuid = randomUUID } = {}) {
  async function change({ tenant, userId, actorId }, mutate) {
    return database.withTransaction(async client => {
      // Serialize changes for one vendor, including a new membership with no row to lock yet.
      await client.query('SELECT id FROM tenants WHERE id = $1 FOR UPDATE', [tenant._id]);
      const options = { client };
      const previousUser = await userRepository.findUserById(userId, options);
      const previousLocations = await locationRepository.listAssignedLocationIdsByUserIds(tenant._id, [userId], options);
      const before = accessState(previousUser, tenant._id, previousLocations.get(String(userId)) || []);
      const result = await mutate(options);
      const nextUser = await userRepository.findUserById(userId, options);
      const nextLocations = await locationRepository.listAssignedLocationIdsByUserIds(tenant._id, [userId], options);
      const after = accessState(nextUser, tenant._id, nextLocations.get(String(userId)) || []);
      if (JSON.stringify(before) === JSON.stringify(after)) return result;
      const eventId = uuid();
      const payload = { before, after, occurredAt: new Date().toISOString(), tenantName: tenant.name, memberName: previousUser?.name || 'A team member' };
      const recipients = new Map();
      if (previousUser?.email && previousUser.emailVerified) recipients.set(String(userId), { user: previousUser, audience: 'member' });
      const staff = await userRepository.listUsersByTenantId(tenant._id, options);
      for (const user of staff) {
        if (String(user._id) !== String(actorId) && !recipients.has(String(user._id)) && user.email && user.emailVerified &&
            user.tenantMemberships.some(m => String(m.tenantId) === String(tenant._id) && m.role === 'owner' && m.isActive !== false)) {
          recipients.set(String(user._id), { user, audience: 'owner' });
        }
      }
      for (const { user, audience } of recipients.values()) {
        await client.query(`INSERT INTO staff_access_email_outbox
          (event_id, tenant_id, recipient_user_id, recipient_email, audience, payload)
          VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (event_id, recipient_user_id) DO NOTHING`,
        [eventId, tenant._id, user._id, user.email, audience, JSON.stringify({ ...payload, email: buildTemplateEmail(payload, audience) })]);
      }
      return result;
    });
  }
  return { change };
}
module.exports = { ...createStaffAccessEmailService(), createStaffAccessEmailService, accessState, buildEmail };
