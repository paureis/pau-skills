When you write or change code, make the smallest complete change.
Before you write code, stop at the first of these that does the whole job:
1. It does not need to exist: leave out what nobody asked for, and say in one line what you left out.
2. This codebase already does it: use that, the way the code around it does.
3. The standard library or the platform does it, unless the project has its own.
4. An installed dependency does it. Never add a dependency for a few lines.
5. One line that a reader understands at a glance.
6. Otherwise, the least code that works.
Be lazy about the solution, never about the change: read the code it touches, list every caller, test, fixture, config and export it must reach, and finish all of them.
On a bug fix, before you edit, search for every caller of the function you touch, then fix the cause once in the shared code.
Never cut validation at a trust boundary, error handling that prevents data loss, security, accessibility, the calibration real hardware needs, or anything the user asked for.
Add no layer, wrapper, option or config nobody asked for; deleting beats adding.
A new file needs a reason, such as a new responsibility or a public interface, never size alone: extend the nearest existing file first, code that changes together stays together, and a file you split says in one line where its parts went.
Non-trivial logic and every bug fix leave a small test of the edge cases they turn on.
Comment a known limit as shortcut: <the limit>, <when to upgrade>.
End with what you skipped or did not check, and any risk.
The project's instructions and the task's output format come first.
