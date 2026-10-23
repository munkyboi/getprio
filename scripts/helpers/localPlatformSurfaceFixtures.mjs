/** Fresh local bootstrap through existing repositories/services, never source-data import. */
export async function bootstrapFreshSurfaceFixture({ profile, tag, password, client, dependencies, recordPrepared }) {
  if (!['core', 'sandbox'].includes(profile) || !/^[a-z0-9_]{4,18}$/.test(tag)) throw new Error('Invalid local fixture identity.');
  await client.query('LOCK TABLE users, tenants, developer_accounts, developer_projects, developer_api_keys IN SHARE ROW EXCLUSIVE MODE');
  const row = (await client.query(`SELECT (SELECT count(*) FROM users)::int AS users,
    (SELECT count(*) FROM tenants)::int AS tenants, (SELECT count(*) FROM developer_accounts)::int AS accounts,
    (SELECT count(*) FROM developer_projects)::int AS projects, (SELECT count(*) FROM developer_api_keys)::int AS keys`)).rows[0];
  if (!row || ['users','tenants','accounts','projects','keys'].some(key => Number(row[key]) !== 0)) throw new Error('Bootstrap requires empty isolated identity/domain tables.');
  const core = profile === 'core';
  const username = `ls_${tag}_${core ? 'admin' : 'dev'}`;
  const user = await dependencies.users.createUser({
    name: core ? 'Local Surface Platform Admin' : 'Local Sandbox Developer', username,
    email: `${username}@example.invalid`, emailVerified: true,
    passwordHash: core ? await dependencies.hashPassword(password) : null,
    passwordHashAlgorithm: 'bcrypt', roles: [core ? 'platform_admin' : 'developer'],
    lastLoginProvider: 'password'
  }, { client });
  let result = { profile, tag, userId: String(user._id), username, email: user.email,
    ...(core ? { password, status: 'BOOTSTRAP_MFA_PENDING' } : {}) };
  if (!core) {
    const account = await dependencies.accounts.createAccountForOwner(user._id, { client });
    const project = await dependencies.projects.createProject({ developerAccountId: account.developerAccountId, userId: user._id, name: `Local Sandbox ${tag}` }, { client });
    const generated = dependencies.keys.createApiKey('sandbox');
    const key = await dependencies.projects.createApiKey({ projectId: project.id, userId: user._id, name: `Local Sandbox ${tag}`, environment: 'sandbox', keyPrefix: generated.keyPrefix, secretHash: generated.secretHash, scopes: ['queues:read', 'queues:write'], profileSlugs: null }, { client });
    result = { ...result, developerAccountId: account.developerAccountId, projectId: project.id, keyId: key.id,
      apiKey: generated.value, status: 'LOCAL_SANDBOX_KEY_CREATED' };
  }
  await dependencies.security.logSecurityEvent({ userId: user._id, eventType: 'local_surface_fixture_created', actorRole: core ? 'platform_admin' : 'developer', metadata: { profile, tag, localOnly: true } }, { client });
  await recordPrepared(result);
  return result;
}
