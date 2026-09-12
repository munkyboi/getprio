const { createBrandedEmail, appUrl } = require('./emailTemplates');

const aliases = Object.freeze({ added: 'getprio-vendor-staff-added', changed: 'getprio-vendor-staff-access-changed', removed: 'getprio-vendor-staff-access-removed' });
const keys = ['ACCESS_SUBJECT_HTML', 'ACCESS_SUBJECT_TEXT', 'BUSINESS_HTML', 'BUSINESS_TEXT', 'CHANGED_AT', 'PREVIOUS_ACCESS', 'UPDATED_ACCESS', 'LOCATION_SUMMARY', 'ACTION_LABEL', 'ACTION_URL'];
const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const marker = key => `GPVAR_${key}_END`;

function templateContent(kind) {
  if (!aliases[kind]) throw new Error('Unknown staff access template');
  const content = createBrandedEmail({
    subject: `Vendor access ${kind} — ${marker('BUSINESS_TEXT')}`,
    title: `Vendor access ${kind}`, illustration: 'account-verification',
    message: `${marker('ACCESS_SUBJECT_TEXT')} access to ${marker('BUSINESS_TEXT')} was ${kind}. ${kind === 'added' ? 'Workspace access has been granted; no invitation acceptance is required.' : 'Review the saved change below.'}`,
    details: [{ label: 'Business', value: marker('BUSINESS_TEXT') }, { label: 'Changed at (UTC)', value: marker('CHANGED_AT') },
      { label: 'Previous access', value: marker('PREVIOUS_ACCESS') }, { label: 'Updated access', value: marker('UPDATED_ACCESS') },
      { label: 'Location assignments', value: marker('LOCATION_SUMMARY') }],
    actionLabel: marker('ACTION_LABEL'), actionUrl: `https://getprio.online/${marker('ACTION_URL')}`,
    footer: 'If you did not expect this change, contact your business owner or GetPrio support.'
  });
  for (const field of ['html', 'text', 'subject']) {
    content[field] = content[field].replaceAll(`https://getprio.online/${marker('ACTION_URL')}`, marker('ACTION_URL'));
    for (const key of keys) {
      const target = field === 'html' ? key.replace(/_TEXT$/, '_HTML') : key;
      content[field] = content[field].replaceAll(marker(key), `{{{${target}}}}`);
    }
  }
  return { ...content, variables: keys.map(key => ({ key, type: 'string' })) };
}

function buildTemplateEmail(payload, audience) {
  const { before, after, tenantName, memberName, occurredAt } = payload;
  const kind = !before ? 'added' : !after ? 'removed' : 'changed';
  const stateText = state => state ? `${({ owner: 'Owner', admin: 'Admin', staff: 'Staff' })[state.role] || 'Member'} · ${state.active ? 'Active' : 'Disabled'}` : 'No access';
  const subjectPerson = audience === 'owner' ? `${memberName}'s` : 'Your';
  const variables = {
    ACCESS_SUBJECT_HTML: escapeHtml(subjectPerson), ACCESS_SUBJECT_TEXT: subjectPerson,
    BUSINESS_HTML: escapeHtml(tenantName), BUSINESS_TEXT: tenantName,
    CHANGED_AT: occurredAt,
    PREVIOUS_ACCESS: stateText(before), UPDATED_ACCESS: stateText(after),
    LOCATION_SUMMARY: !after ? 'Removed with workspace access.' : before && JSON.stringify(before.locations) === JSON.stringify(after.locations) ? 'No change.' : 'Review current assignments in the dashboard.',
    ACTION_LABEL: after?.active || audience === 'owner' ? 'Open dashboard' : 'Open GetPrio',
    ACTION_URL: appUrl(after?.active || audience === 'owner' ? '/dashboard' : '/login')
  };
  for (const [key, value] of Object.entries(variables)) {
    if (typeof value !== 'string' || !value || value.length > 2000) throw new Error(`Invalid staff template variable: ${key}`);
  }
  return { subject: `Vendor access ${kind} — ${tenantName}`, resendTemplate: { id: aliases[kind], variables } };
}

// Local previews use the same template contract as the managed Resend versions.
function previewEmail(payload, audience) {
  const message = buildTemplateEmail(payload, audience);
  const kind = Object.keys(aliases).find(key => aliases[key] === message.resendTemplate.id);
  const content = templateContent(kind);
  const fill = source => source.replace(/\{\{\{([A-Z_]+)\}\}\}/g, (_match, key) => message.resendTemplate.variables[key]);
  return { subject: message.subject, html: fill(content.html), text: fill(content.text) };
}
module.exports = { aliases, templateContent, buildTemplateEmail, previewEmail };
