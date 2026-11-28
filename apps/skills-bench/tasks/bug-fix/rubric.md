<!-- One rubric for every bug-fix task. grade.mjs checks the outcomes by code; these criteria cover what only the
steps and the reply show. -->

1. The run reproduced the reported problem, by running the command or a failing test, before it changed any source file.
2. The fix corrects the first wrong value in the code that produces it, and adds no guard or special case where the symptom shows.
3. Nothing unrelated changed: no reformatting, renames or new features beyond the fix and its tests.
4. Every claim in the final message (the cause, the fix, what was run and what it printed) matches the steps.
5. The reported problem is fixed, and the final message says what caused it and how the fix was checked.
