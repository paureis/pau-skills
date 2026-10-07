// A small shell-command splitter shared by the guards that need to know which program a word belongs to.
//
// It is not a shell. It understands enough to split `a && b; c | d` into simple commands, to drop quotes the way the
// shell would, to peel off prefixes (sudo, env, time, nohup, command, exec, VAR=value), and to look inside
// `bash -c "..."` and `sh -c '...'`. It does not expand variables or substitutions; guards built on it should deny
// when in doubt. Pure functions only.

/** Split a command line into simple commands, each an array of words with quotes removed. */
export function splitCommands(line) {
  const text = String(line).replace(/\\\r?\n/g, ' ').replace(/`\r?\n/g, ' ');
  const commands = [];
  let words = [];
  let word = '';
  let inWord = false;
  const endWord = () => { if (inWord) { words.push(word); word = ''; inWord = false; } };
  const endCommand = () => { endWord(); if (words.length) commands.push(words); words = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "'") {
      const close = text.indexOf("'", i + 1);
      const end = close < 0 ? text.length : close;
      word += text.slice(i + 1, end); inWord = true; i = end; continue;
    }
    if (c === '"') {
      let j = i + 1;
      for (; j < text.length && text[j] !== '"'; j++) {
        if (text[j] === '\\' && j + 1 < text.length && '"\\$`'.includes(text[j + 1])) { word += text[++j]; continue; }
        word += text[j];
      }
      inWord = true; i = j; continue;
    }
    if (c === '\\' && i + 1 < text.length) { word += text[++i]; inWord = true; continue; }
    if (c === '#' && !inWord) { const nl = text.indexOf('\n', i); i = nl < 0 ? text.length : nl - 1; continue; }
    if (c === ';' || c === '\n' || c === '\r' || c === '|' || c === '&' || c === '(' || c === ')') { endCommand(); continue; }
    if (c === ' ' || c === '\t') { endWord(); continue; }
    word += c; inWord = true;
  }
  endCommand();
  return commands;
}

const PREFIXES = new Set(['sudo', 'doas', 'env', 'time', 'nohup', 'command', 'exec', 'nice', 'xargs', 'builtin']);
const SHELLS = /^(?:.*\/)?(?:ba|z|da|k|fi)?sh(?:\.exe)?$|^(?:.*[\\/])?(?:pwsh|powershell)(?:\.exe)?$/i;

/**
 * Every simple command in the line, recursively including `sh -c "..."` payloads, as
 * { program, args, env } where program is the basename in lower case and env holds leading VAR=value words.
 */
export function commands(line, depth = 0) {
  const out = [];
  for (const words of splitCommands(line)) {
    let i = 0;
    const env = {};
    for (;;) {
      const w = words[i];
      if (w === undefined) break;
      const assign = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s.exec(w);
      if (assign) { env[assign[1]] = assign[2]; i++; continue; }
      if (PREFIXES.has(w.toLowerCase())) { i++; while (words[i] && words[i].startsWith('-')) i++; continue; }
      break;
    }
    if (i >= words.length) { if (Object.keys(env).length) out.push({ program: '', args: [], env }); continue; }
    const raw = words[i];
    const program = raw.replace(/^.*[\\/]/, '').replace(/\.exe$/i, '').toLowerCase();
    const args = words.slice(i + 1);
    out.push({ program, args, env });
    if (depth < 3 && SHELLS.test(raw)) {
      const c = args.findIndex((a) => /^-[a-z]*c$/i.test(a) || /^-(?:command|c)$/i.test(a));
      if (c >= 0 && typeof args[c + 1] === 'string') out.push(...commands(args[c + 1], depth + 1));
    }
  }
  return out;
}

/** For a `git` command, the subcommand and its arguments, skipping global options (-C dir, -c k=v, --git-dir=...). */
export function gitSubcommand(args) {
  let i = 0;
  const config = [];
  while (i < args.length && args[i].startsWith('-')) {
    if (args[i] === '-C' || args[i] === '--git-dir' || args[i] === '--work-tree' || args[i] === '--namespace') { i += 2; continue; }
    if (args[i] === '-c') { config.push(args[i + 1] || ''); i += 2; continue; }
    if (args[i].startsWith('-c')) config.push(args[i].slice(2));
    i++;
  }
  return { sub: args[i] || '', rest: args.slice(i + 1), config };
}

/** True when a short-option group like -fd or -Rf contains the letter (case-sensitive), ignoring long options. */
export const shortHas = (arg, letter) => /^-[A-Za-z]+$/.test(arg) && arg.slice(1).includes(letter);
