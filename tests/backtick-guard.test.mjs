// The inline-backtick guard must BLOCK the real defect and PASS everything else. A gate that cries wolf gets ignored,
// and an ignored gate is worse than no gate.
//
// The "printf prose" and "single-quoted payload" cases were added after the hook blocked its own retrospective commit:
// a printf whose PROSE mentioned "node -e" and contained backticks, executing nothing. That false positive exposed two
// real flaws: matching the interpreter anywhere rather than at a command position, and ignoring that backticks inside
// SINGLE quotes are literal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repo, runNode } from './helpers.mjs';

const HOOK = repo('hooks', 'guards', 'block-inline-backtick-payload.mjs');
const BT = String.fromCharCode(96); // keep literal backticks out of this file's source

const cases = [
  // MUST BLOCK: the real defect, in its recorded forms.
  ['BLOCK', 'prose payload with backticks', 'node -e "const s=' + BT + 'ORACLE-ALL is unsatisfiable' + BT + '; console.log(s)"'],
  ['BLOCK', 'writing markdown with code spans', 'node -e "fs.writeFileSync(f, \\"see ' + BT + 'next.config.ts' + BT + '\\")"'],
  ['BLOCK', 'python -c variant', 'python -c "print(' + BT + 'hello' + BT + ')"'],
  ['BLOCK', 'node --eval variant', 'node --eval "console.log(' + BT + 'x' + BT + ')"'],
  ['BLOCK', 'chained after && is still a command position', 'cd /tmp && node -e "console.log(' + BT + 'x' + BT + ')"'],
  ['BLOCK', 'inside a pipeline is still a command position', 'cat f | node -e "console.log(' + BT + 'x' + BT + ')"'],
  // MUST PASS: legitimate uses that must not be disrupted.
  ['PASS', 'inline script with NO backtick', 'node -e "console.log(JSON.parse(process.argv[1]).length)" \'[1,2]\''],
  ['PASS', 'running a script FILE that itself contains backticks', 'node ./tmp/gen.mjs'],
  ['PASS', 'ordinary shell command substitution, no inline interpreter', 'git commit -F "$(ls -t /tmp/msg*.txt | head -1)"'],
  ['PASS', 'a heredoc feeding node', "node <<'EOF'\nconsole.log(1)\nEOF"],
  ['PASS', 'grep for a backtick in a file', "grep -n '" + BT + "' docs/KNOWN-TRAPS.md"],
  ['PASS', 'npm test', 'npm test'],
  ['PASS', 'a backtick inside a CLI query string, no inline interpreter', 'az webapp list --query "[?name==' + BT + 'x' + BT + '].name" -o tsv'],
  // The false positive that caught the hook's own commit.
  ['PASS', 'printf PROSE that merely MENTIONS node -e and contains backticks',
    "printf 'retrospective: mechanize the node -e rule\\n\\nbash executed " + BT + 'ORACLE-ALL' + BT + ' and ' + BT + 'D2' + BT + " as commands\\n' > /tmp/m.txt && git commit -F /tmp/m.txt"],
  ['PASS', 'SINGLE-quoted inline payload: bash does no substitution', "node -e 'console.log(" + BT + 'safe' + BT + ")'"],
  // Single quotes NESTED in a double-quoted payload protect nothing.
  ['BLOCK', 'JS string literal in single quotes inside node -e "..."', 'cd ./x && node -e "\nconst s=\'(see the memory ' + BT + 'accounts-note' + BT + ').\';\nconsole.log(s);\n"'],
  ['PASS', 'control: single-quoted payload whose INNER double quotes hold the backtick', "node -e 'const s=\"" + BT + 'safe' + BT + "\"; console.log(s)'"],
];

for (const [want, label, command] of cases) {
  test(`${want}: ${label}`, () => {
    const r = runNode(HOOK, { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }) });
    assert.equal(r.code === 2 ? 'BLOCK' : 'PASS', want, `command: ${command.replace(/\n/g, '\\n')}\nstderr: ${r.stderr}`);
    if (want === 'BLOCK') assert.match(r.stderr, /write the script/);
  });
}

test('other tools and malformed input pass untouched', () => {
  const cmd = 'node -e "' + BT + 'x' + BT + '"';
  assert.equal(runNode(HOOK, { input: JSON.stringify({ tool_name: 'PowerShell', tool_input: { command: cmd } }) }).code, 0);
  assert.equal(runNode(HOOK, { input: 'not json' }).code, 0);
  assert.equal(runNode(HOOK, { input: '' }).code, 0);
  assert.equal(runNode(HOOK, { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 5 } }) }).code, 0);
});
