const { containsPhoneNumber } = require('../src/utils/phoneFilter');

describe('Phone Number Filter Utility Tests', () => {
  test('should detect pure digit phone numbers', () => {
    expect(containsPhoneNumber('9876543210')).toBe(true);
    expect(containsPhoneNumber('1234567890')).toBe(true);
    expect(containsPhoneNumber('+919876543210')).toBe(true);
  });

  test('should detect phone numbers with common separators', () => {
    expect(containsPhoneNumber('987-654-3210')).toBe(true);
    expect(containsPhoneNumber('987 654 3210')).toBe(true);
    expect(containsPhoneNumber('+91 98765 43210')).toBe(true);
    expect(containsPhoneNumber('(987) 654-3210')).toBe(true);
    expect(containsPhoneNumber('987.654.3210')).toBe(true);
    expect(containsPhoneNumber('98,76,54,32,10')).toBe(true);
    expect(containsPhoneNumber('98_76_54_32_10')).toBe(true);
    expect(containsPhoneNumber('98/76/54/32/10')).toBe(true);
  });

  test('should detect phone numbers written in words', () => {
    expect(containsPhoneNumber('nine eight seven six five four three two one zero')).toBe(true);
    expect(containsPhoneNumber('nine-eight-seven-six-five-four-three-two-one-zero')).toBe(true);
    expect(containsPhoneNumber('one nine seven four six two eight three seven one')).toBe(true);
  });

  test('should detect phone numbers with multipliers', () => {
    expect(containsPhoneNumber('double nine six five four three two one zero')).toBe(true);
    expect(containsPhoneNumber('triple six five four three two one')).toBe(true);
  });

  test('should detect mixed numbers and words', () => {
    expect(containsPhoneNumber('9 eight 7 six 5 four 3 two 1 zero')).toBe(true);
    expect(containsPhoneNumber('nine 8 seven 6 five 4 three 2 one 0')).toBe(true);
  });

  test('should not trigger on small digits or normal years/amounts', () => {
    expect(containsPhoneNumber('The year is 2026.')).toBe(false);
    expect(containsPhoneNumber('I bought 3 cats and 4 dogs.')).toBe(false);
    expect(containsPhoneNumber('Total price is $1,000,000.')).toBe(false);
  });

  test('should not trigger on words containing number substrings', () => {
    expect(containsPhoneNumber('someone is doing honest work')).toBe(false);
    expect(containsPhoneNumber('this is a fine line')).toBe(false);
    expect(containsPhoneNumber('the weight is eighty kg')).toBe(false);
  });
});
