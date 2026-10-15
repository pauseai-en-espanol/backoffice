#!/usr/bin/env node
// The charts' network policies (ADR-0001), checked in CI after `helm lint`:
// - on, the web, forms and API charts refuse to render without gateways, with a gateway without pod labels, or (the
//   API's) without the database's namespace, since such a policy would shut everyone out (Cilium drops; the pods stay
//   Ready) or admit a whole namespace;
// - with the CI values, the API policy's rules for the web and forms apps' pods match their Deployments' pod labels
//   (the umbrella's nameOverrides and the policy's webName and formsName must agree), or every page would hang on the
//   API;
// - every job's pods are selected by the jobs' policy, and none carries the API's selector labels, which would let the
//   API's Service send them requests;
// - the bot can't be turned on without sign-in and the app role, nor the forms app's routes with half their settings.
// Usage: node scripts/check-network-policies.mjs (needs helm, and the umbrella's dependencies built)
import { spawnSync } from 'node:child_process';

const helm = (chart, ...args) =>
  spawnSync('helm', ['template', 'backoffice', chart, ...args], { encoding: 'utf8' });
const fail = (message) => {
  console.error(`check-network-policies: ${message}`);
  process.exit(1);
};

const refusals = [
  ['apps/web/helm-chart', 'no gateway', ['--set', 'networkPolicy.enabled=true']],
  [
    'apps/web/helm-chart',
    'a gateway without pod labels',
    [
      '--set',
      'networkPolicy.enabled=true',
      '--set-json',
      'networkPolicy.gateways=[{"namespace":"envoy-gateway-system"}]',
    ],
  ],
  ['apps/forms/helm-chart', 'no gateway', ['--set', 'networkPolicy.enabled=true']],
  [
    'apps/forms/helm-chart',
    'a gateway without pod labels',
    [
      '--set',
      'networkPolicy.enabled=true',
      '--set-json',
      'networkPolicy.gateways=[{"namespace":"envoy-gateway-system"}]',
    ],
  ],
  [
    'apps/api/helm-chart',
    'no gateway',
    ['--set', 'networkPolicy.enabled=true', '--set', 'networkPolicy.database.namespace=postgresql'],
  ],
  [
    'apps/api/helm-chart',
    'a gateway without pod labels',
    [
      '--set',
      'networkPolicy.enabled=true',
      '--set',
      'networkPolicy.database.namespace=postgresql',
      '--set-json',
      'networkPolicy.gateways=[{"namespace":"envoy-gateway-system"}]',
    ],
  ],
  [
    'apps/api/helm-chart',
    'no database namespace',
    [
      '--set',
      'networkPolicy.enabled=true',
      '--set-json',
      'networkPolicy.gateways=[{"namespace":"gw","podLabels":{"a":"b"}}]',
    ],
  ],
  [
    'apps/api/helm-chart',
    'error tracking without pod labels',
    [
      '--set',
      'networkPolicy.enabled=true',
      '--set',
      'networkPolicy.database.namespace=postgresql',
      '--set-json',
      'networkPolicy.gateways=[{"namespace":"gw","podLabels":{"a":"b"}}]',
      '--set',
      'networkPolicy.errorTracking.namespace=glitchtip',
    ],
  ],
  ['apps/api/helm-chart', 'the bot without sign-in', ['--set', 'telegram.enabled=true']],
  [
    'apps/api/helm-chart',
    "the forms app's secret without its role",
    ['--set', 'formsTokenSecret.name=backoffice-forms-token'],
  ],
];
for (const [chart, what, extra] of refusals) {
  if (helm(chart, '--set', 'image.tag=x', ...extra).status === 0) {
    fail(`${chart} rendered with ${what}`);
  }
}

const umbrella = helm(
  'helm-charts/backoffice',
  '--values',
  'helm-charts/backoffice/ci/example-values.yaml',
);
if (umbrella.status !== 0) {
  fail(`the umbrella chart didn't render: ${umbrella.stderr}`);
}
const documents = umbrella.stdout.split(/^---$/m);
const named = (kind, name) =>
  documents.find(
    (doc) => new RegExp(`kind: ${kind}\\n`).test(doc) && doc.includes(`name: ${name}\n`),
  );
const podLabels = (doc) => {
  const template = doc.slice(doc.indexOf('template:'));
  return {
    name: /app\.kubernetes\.io\/name: (\S+)/.exec(template)?.[1],
    instance: /app\.kubernetes\.io\/instance: (\S+)/.exec(template)?.[1],
  };
};

const apiPolicy = named('NetworkPolicy', 'backoffice-api');
const web = named('Deployment', 'backoffice-web');
const forms = named('Deployment', 'backoffice-forms');
const api = named('Deployment', 'backoffice-api');
if (!apiPolicy || !web || !forms || !api) {
  fail(
    'the CI values render no API network policy, or no web, forms or API Deployment: they should render all four',
  );
}
// The API policy's same-namespace rules, in order: the web app's pods, then the forms app's.
const admitted = [
  ...apiPolicy.matchAll(
    /- podSelector:\n\s+matchLabels:\n\s+app\.kubernetes\.io\/instance: (\S+)\n\s+app\.kubernetes\.io\/name: (\S+)/g,
  ),
].map(([, instance, name]) => ({ instance, name }));
for (const [index, [what, deployment]] of [
  ['web', web],
  ['forms', forms],
].entries()) {
  const { instance, name } = admitted[index] ?? {};
  const pods = podLabels(deployment);
  if (!name || name !== pods.name || instance !== pods.instance) {
    fail(
      `the API policy admits ${what} pods named ${name} (${instance}), but they are ${pods.name} (${pods.instance})`,
    );
  }
}

const jobsPolicy = named('NetworkPolicy', 'backoffice-api-jobs');
const components = /values: \[([^\]]+)\]/.exec(jobsPolicy ?? '')?.[1]?.split(/,\s*/) ?? [];
const apiPods = podLabels(api);
const cronJobs = documents.filter((doc) => /kind: CronJob\n/.test(doc));
if (cronJobs.length !== 4) {
  fail(`the CI values render ${cronJobs.length} CronJobs, not the 4 they turn on`);
}
for (const job of cronJobs) {
  const template = job.slice(job.indexOf('jobTemplate:'));
  const component = /app\.kubernetes\.io\/component: (\S+)/.exec(template)?.[1];
  const jobPods = podLabels(job.slice(job.indexOf('jobTemplate:')));
  if (!component || !components.includes(component)) {
    fail(`the jobs' network policy doesn't select the ${component} job's pods`);
  }
  if (jobPods.name === apiPods.name) {
    fail(
      `the ${component} job's pods carry the API's name, so the API's Service would send them requests`,
    );
  }
}
console.log('check-network-policies: ok');
