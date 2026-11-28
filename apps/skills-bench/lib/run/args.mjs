// skills-bench runner: the command line.
export const USAGE = `usage:
  bench.mjs plan --config <pilot.json> --model <id> [--max-usd <x>] [--price <difficulty>=<usd>]... [--usd-per-judge <y>]
  bench.mjs run --config <pilot.json> --model <id> --round <dir> --max-usd <x> [--only <task-id>]... [--n <n>] [--price <difficulty>=<usd>]... [--parallel <k>] [--pass-env <NAME>...] [--real-home]
  bench.mjs judge --round <dir> --judge-model <id> [--pass-env <NAME>...] [--real-home]
  bench.mjs owner-sheet --round <dir> --out <new folder> [--seed <n>]
  bench.mjs owner-grades --round <dir> --tdd <file> --bug-fix <file>
  bench.mjs export --round <dir> --to <folder> --auth login|api-key|unknown`;

const FLAGS = {
  plan: { '--config': 'one', '--model': 'one', '--max-usd': 'one', '--price': 'many', '--usd-per-judge': 'one' },
  run: {
    '--config': 'one', '--model': 'one', '--round': 'one', '--max-usd': 'one', '--only': 'many', '--n': 'one',
    '--price': 'many', '--parallel': 'one', '--pass-env': 'list', '--real-home': 'bool',
  },
  judge: { '--round': 'one', '--judge-model': 'one', '--pass-env': 'list', '--real-home': 'bool' },
  'owner-sheet': { '--round': 'one', '--out': 'one', '--seed': 'one' },
  'owner-grades': { '--round': 'one', '--tdd': 'one', '--bug-fix': 'one' },
  export: { '--round': 'one', '--to': 'one', '--auth': 'one' },
};
const NEEDS = {
  plan: ['--config', '--model'], run: ['--config', '--model', '--round'], judge: ['--round', '--judge-model'],
  'owner-sheet': ['--round', '--out'], 'owner-grades': ['--round', '--tdd', '--bug-fix'], export: ['--round', '--to', '--auth'],
};
const fail = (msg) => { throw new Error(`${msg}\n${USAGE}`); };
const camel = (flag) => flag.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/** Parse the command line; throws on anything it does not understand. */
export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd) throw new Error(USAGE);
  if (!Object.hasOwn(FLAGS, cmd)) fail(`unknown command ${cmd}`);
  const raw = {};
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    const kind = Object.hasOwn(FLAGS[cmd], flag) ? FLAGS[cmd][flag] : null;
    if (!kind) fail(`unknown option ${flag}`);
    if (kind === 'bool') { raw[flag] = true; continue; }
    if (kind === 'list') {
      const start = i + 1;
      while (rest[i + 1] !== undefined && !rest[i + 1].startsWith('--')) i++;
      if (i < start) fail(`${flag} needs a value`);
      (raw[flag] ||= []).push(...rest.slice(start, i + 1));
      continue;
    }
    const val = rest[++i];
    if (val === undefined || val.startsWith('--')) fail(`${flag} needs a value`);
    if (kind === 'many') (raw[flag] ||= []).push(val);
    else if (flag in raw) fail(`${flag} is given twice`);
    else raw[flag] = val;
  }
  for (const f of NEEDS[cmd]) if (raw[f] === undefined) fail(`${cmd} needs ${f}`);
  const o = { cmd };
  for (const [flag, v] of Object.entries(raw)) o[camel(flag)] = v;
  o.prices = raw['--price'] || [];
  o.only = raw['--only'] || [];
  o.passEnv = raw['--pass-env'] || [];
  o.realHome = !!raw['--real-home'];
  for (const n of o.passEnv) if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) fail(`--pass-env takes variable names: ${n}`);
  const int = (flag, min, max) => {
    if (raw[flag] === undefined) return undefined;
    if (!/^-?\d+$/.test(raw[flag]) || Number(raw[flag]) < min || Number(raw[flag]) > max) fail(`${flag} must be a whole number from ${min} to ${max}`);
    return Number(raw[flag]);
  };
  o.n = int('--n', 1, 20);
  o.parallel = int('--parallel', 1, 100);
  o.seed = int('--seed', 0, 2 ** 31);
  if (cmd === 'export' && !['login', 'api-key', 'unknown'].includes(o.auth)) fail('--auth takes login, api-key or unknown');
  return o;
}
