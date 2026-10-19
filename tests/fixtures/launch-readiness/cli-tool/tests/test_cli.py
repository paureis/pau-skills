import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout

from tally.cli import main
from tally.counting import count_text, total


class CountingTest(unittest.TestCase):
    def test_counts_lines_words_and_chars(self):
        c = count_text("a", "one two\nthree\n")
        self.assertEqual((c.lines, c.words, c.chars), (2, 3, 14))

    def test_total_adds_every_file(self):
        t = total([count_text("a", "x\n"), count_text("b", "y z\n")])
        self.assertEqual((t.name, t.lines, t.words), ("total", 2, 3))


class CliTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.dir.name, "notes.txt")
        with open(self.path, "w", encoding="utf-8") as handle:
            handle.write("hello world\nsecond line\n")

    def tearDown(self):
        self.dir.cleanup()

    def run_cli(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = main(list(args))
        return code, out.getvalue(), err.getvalue()

    def test_json_output(self):
        code, out, _ = self.run_cli("--json", self.path)
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out)[0]["words"], 4)

    def test_table_has_a_total_for_two_files(self):
        code, out, _ = self.run_cli(self.path, self.path)
        self.assertEqual(code, 0)
        self.assertIn("total", out)

    def test_missing_file_exits_1(self):
        code, _, err = self.run_cli(os.path.join(self.dir.name, "nope.txt"))
        self.assertEqual(code, 1)
        self.assertIn("nope.txt", err)


if __name__ == "__main__":
    unittest.main()
