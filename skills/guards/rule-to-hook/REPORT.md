# Report

Names and `${CLAUDE_SKILL_DIR}` mean what SKILL.md says: `${CLAUDE_SKILL_DIR}` is this folder.

```
Rule:        <precise one-sentence rule>   (from <file:line>)
Layer:       <architecture | types | lint or CI check | test | hook | prose>
             Higher layers: <why each layer above did not work, one line each>
Mechanism:   <hook event + matcher | git hook | linter rule | CI check | test>, output <exit 2 | ask | context>
             Ratchet: <none | baseline n in <file>>   Why: <one line>
Files:       <guard path>, <test path>, <settings or config path>
Tests:       <n> DENY, <n> PASS, subprocess checks | ratchet: <n> counted, <n> not, baseline cases | the case that
             no longer builds; all green
Mutation:    <what you broke> -> <n> tests red; restored, clean diff, green again | none (architecture or types)
Past mistake: <sha>^: fails with "<message>" | no past mistake in history
Live check:  denied: <harmless command> | passed: <near-miss> | CI: <run that failed on the violation>
Rule text:   updated with "Enforced by: ..." at <file:line>; rule table row at <file:line> | dropped, mistake impossible
Not covered: <variants the guard knowingly misses, and why; or "none known">
```
