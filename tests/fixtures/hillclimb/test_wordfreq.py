import unittest

from wordfreq import tokenize, top_words


class TopWords(unittest.TestCase):
    def test_counts_and_order(self):
        text = "the cat and the hat and the bat"
        self.assertEqual(top_words(text, 3), [("the", 3), ("and", 2), ("bat", 1)])

    def test_case_and_punctuation(self):
        self.assertEqual(top_words("Dog, dog! DOG? cat.", 2), [("dog", 3), ("cat", 1)])

    def test_apostrophes_and_digits_stay_in_a_word(self):
        self.assertEqual(tokenize("it's 42 o'clock"), ["it's", "42", "o'clock"])

    def test_ties_are_alphabetical(self):
        self.assertEqual(top_words("b a c b a c", 3), [("a", 2), ("b", 2), ("c", 2)])

    def test_empty_text(self):
        self.assertEqual(top_words("", 5), [])
        self.assertEqual(tokenize("  ,, "), [])


if __name__ == "__main__":
    unittest.main()
