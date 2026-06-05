function containsPhoneNumber(text) {
  if (typeof text !== 'string') return false;
  
  const wordToDigit = {
    'zero': '0', 'nil': '0', 'oh': '0',
    'one': '1',
    'two': '2',
    'three': '3',
    'four': '4',
    'five': '5',
    'six': '6',
    'seven': '7',
    'eight': '8',
    'nine': '9'
  };
  
  let normalizedText = text.toLowerCase();
  
  // Expand multipliers (e.g. "double nine", "triple six")
  normalizedText = normalizedText.replace(/\bdouble\s+(zero|nil|oh|one|two|three|four|five|six|seven|eight|nine)\b/g, (match, word) => {
    const digit = wordToDigit[word];
    return digit ? digit + digit : match;
  });
  
  normalizedText = normalizedText.replace(/\btriple\s+(zero|nil|oh|one|two|three|four|five|six|seven|eight|nine)\b/g, (match, word) => {
    const digit = wordToDigit[word];
    return digit ? digit + digit + digit : match;
  });
  
  // Replace standard number words with digits using word boundaries to avoid false positives (e.g. "someone")
  for (const [word, digit] of Object.entries(wordToDigit)) {
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    normalizedText = normalizedText.replace(regex, digit);
  }
  
  // Regex to match a sequence of 8 or more digits, allowing common separation characters
  const phoneRegex = /(?:\+?\d[\s\-\.\(\)\,\_\/]*){8,}/;
  return phoneRegex.test(normalizedText);
}

module.exports = { containsPhoneNumber };
