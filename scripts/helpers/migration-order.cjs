const fs = require('node:fs');
const path = require('node:path');

// Preserve historical filenames and migration markers. These explicit edges
// correct only the queue feature's same-day dependency order; SQL is unchanged.
const DEPENDENCIES = Object.freeze({
  '20261017_named_extra_members_v1.sql': ['20261017_selection_child_execution.sql'],
  '20261017_named_resource_archival.sql': ['20261017_resource_members_and_queue_policies.sql'],
  '20261017_queue_plan_catalog_revision.sql': ['20261017_add_queue_plan_drafts.sql'],
  '20261017_queue_plan_draft_audit.sql': ['20261017_add_queue_plan_drafts.sql'],
  '20261017_queue_plan_publication.sql': ['20261017_add_queue_plan_drafts.sql'],
  '20261017_queue_plan_skip_recall_v1.sql': ['20261017_selection_child_execution.sql'],
  '20261017_queue_reservation_groups.sql': ['20261017_queue_plan_publication.sql'],
  '20261017_queue_selection_drafts.sql': ['20261017_add_queue_plan_drafts.sql'],
  '20261017_queue_selection_input_version.sql': ['20261017_add_queue_plan_drafts.sql'],
  '20261017_queue_service_configuration_v4.sql': ['20261017_selection_child_execution.sql'],
  '20261017_queue_station_workflows.sql': ['20261017_queue_plan_publication.sql'],
  '20261017_selection_child_execution.sql': ['20261017_queue_reservation_groups.sql', '20261017_resource_members_and_queue_policies.sql'],
  '20261020_add_resource_display_order.sql': ['20261017_resource_members_and_queue_policies.sql'],
});

function orderMigrationNames(names, dependencies = DEPENDENCIES) {
  const pending = [...names].sort((left, right) => left < right ? -1 : Number(left > right));
  if (new Set(pending).size !== pending.length) throw new Error('Duplicate migration filename.');
  const available = new Set(pending), applied = new Set(), result = [];
  for (const name of pending) {
    for (const dependency of dependencies[name] || []) {
      if (!available.has(dependency)) throw new Error(`Migration ${name} requires missing file ${dependency}.`);
    }
  }
  while (pending.length) {
    const index = pending.findIndex(name => (dependencies[name] || []).every(dependency => applied.has(dependency)));
    if (index === -1) throw new Error(`Migration dependency cycle: ${pending.join(', ')}.`);
    const [name] = pending.splice(index, 1);
    result.push(name); applied.add(name);
  }
  return result;
}

function orderedMigrationFiles(directory) {
  return orderMigrationNames(fs.readdirSync(directory, {withFileTypes:true})
    .filter(entry => entry.isFile() && entry.name.endsWith('.sql')).map(entry => entry.name))
    .map(name => path.join(directory, name));
}

if (require.main === module) {
  try {
    if (process.argv.length !== 3) throw new Error('Provide the migration directory.');
    process.stdout.write(orderedMigrationFiles(process.argv[2]).join('\n'));
  } catch (error) {
    console.error(error.message); process.exitCode = 1;
  }
}
module.exports = {DEPENDENCIES, orderMigrationNames, orderedMigrationFiles};
