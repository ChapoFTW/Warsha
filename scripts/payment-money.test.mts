import {
  addMinor,
  calculateCommissionMinor,
  egpDecimalToMinor,
  formatMinor,
  minor,
  subtractMinor,
} from '../src/payments/money.ts';

function equal<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function throws(operation: () => unknown, message: string) {
  try {
    operation();
  } catch {
    return;
  }
  throw new Error(`${message}: expected operation to throw`);
}

equal(egpDecimalToMinor('1250'), '125000', 'whole EGP converts to integer piastres');
equal(egpDecimalToMinor('1250.05'), '125005', 'piastres are preserved exactly');
equal(calculateCommissionMinor('100000'), '10000', 'default commission is 10 percent');
equal(calculateCommissionMinor('109'), '10', 'commission floors at the piastre boundary');
equal(subtractMinor('100000', calculateCommissionMinor('100000')), '90000', 'provider net uses bigint arithmetic');
equal(addMinor('90000', '10000'), '100000', 'money components add exactly');
equal(formatMinor('125000', 'en'), 'EGP 1,250', 'English whole-pound display omits fake decimals');
equal(formatMinor('125050', 'en'), 'EGP 1,250.50', 'English piastres display only when present');
equal(formatMinor('125000', 'ar'), '\u0661\u066C\u0662\u0665\u0660 \u062C.\u0645', 'Egyptian Arabic display uses localized digits');
equal(formatMinor('125050', 'ar'), '\u0661\u066C\u0662\u0665\u0660\u066B\u0665\u0660 \u062C.\u0645', 'Egyptian Arabic piastres use localized digits and separator');
equal(formatMinor('1000000000', 'en'), 'EGP 10,000,000', 'the largest supported amount formats without a BigInt Intl conversion');
throws(() => minor('-1'), 'negative authoritative money is rejected');
throws(() => egpDecimalToMinor('1.001'), 'sub-piastre input is rejected');

console.log('Payment money tests passed: 13 assertions.');
