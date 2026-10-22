// Reconcile the Vercel settings that cannot live in vercel.json. Read-only by
// default; --apply performs the reviewed changes. VERCEL_TOKEN stays in memory.
const token = process.env.VERCEL_TOKEN;
if (!token) throw new Error('Set VERCEL_TOKEN to an account token with project settings access');
const team = 'team_GTGDpMFOkFmLBFxKfN8jTTvX';
const projects = ['agent-commons', 'commons-courses', 'agent-commons-commons-docs'];
const apply = process.argv.includes('--apply');
const desired = {
  enableAffectedProjectsDeployments: true,
  resourceConfig: {
    buildMachineType: 'basic',
    buildMachineSelection: 'fixed',
    elasticConcurrencyEnabled: false,
  },
};

for (const name of projects) {
  const url = `https://api.vercel.com/v9/projects/${encodeURIComponent(name)}?teamId=${team}`;
  const read = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!read.ok) throw new Error(`${name}: cannot read project (HTTP ${read.status})`);
  const before = await read.json();
  const expectedRoot = `apps/${name === 'agent-commons' ? 'commons-app' : name === 'agent-commons-commons-docs' ? 'commons-docs' : name}`;
  if (before.rootDirectory !== expectedRoot || before.link?.repo !== 'agent-commons' || before.link?.org !== 'Arttribute') {
    throw new Error(`${name}: refusing to update an unexpected project or repository`);
  }
  console.log(JSON.stringify({ project: name, mode: apply ? 'apply' : 'plan',
    before: { enableAffectedProjectsDeployments: before.enableAffectedProjectsDeployments ?? false, resourceConfig: before.resourceConfig },
    after: desired }));
  if (!apply) continue;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    // Keep every function/runtime override; this changes build resources only.
    body: JSON.stringify({ ...desired, resourceConfig: { ...before.resourceConfig, ...desired.resourceConfig } }),
  });
  if (!response.ok) throw new Error(`${name}: update failed (HTTP ${response.status}): ${await response.text()}`);
  const updated = await response.json();
  for (const [key, value] of Object.entries(desired.resourceConfig)) {
    if (updated.resourceConfig?.[key] !== value) throw new Error(`${name}: ${key} was not saved`);
  }
  console.log(`${name}: settings saved`);
}
