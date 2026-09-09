import {rules} from '../src/rules';
import {DropdownOption} from '../src/option';
import '../src/rules-registry';

describe('Check missing fields', () => {
  for (const rule of rules) {
    it(rule.getName(), () => {
      expect(rule.getName()).toBeTruthy();
      expect(rule.getDescription()).toBeTruthy();
      expect(rule.examples.length).toBeGreaterThan(0);
    });
  }
});

// A dropdown's visible label comes from an `enums.<value>` locale key, and getDisplayValue() falls
// back to an empty string when that key is absent. The dropdown then renders blank, which nothing
// else catches: the rule works, its tests pass, its documentation renders the descriptions, and
// only the settings UI is wrong.
describe('Check dropdown values have a display label', () => {
  for (const rule of rules) {
    const dropdowns = rule.options.filter((option) => option instanceof DropdownOption) as DropdownOption[];
    if (dropdowns.length === 0) {
      continue;
    }

    it(rule.getName(), () => {
      for (const dropdown of dropdowns) {
        for (const record of dropdown.options) {
          expect(record.getDisplayValue()).toBeTruthy();
        }
      }
    });
  }
});
