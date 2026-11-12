import assert from "node:assert/strict";
import test from "node:test";

const cases = [
  { label: "addition", initial: 5, operator: "+", operand: 3, expected: [8, 11, 14, 17, 20] },
  { label: "subtraction", initial: 5, operator: "-", operand: 3, expected: [2, -1, -4, -7, -10] },
  { label: "multiplication", initial: 5, operator: "*", operand: 3, expected: [15, 45, 135, 405, 1215] },
  { label: "division", initial: 7, operator: "/", operand: 2, expected: [3.5, 1.75, 0.875, 0.4375, 0.21875] },
];

function apply(left, operator, right) {
  switch (operator) {
    case "+": return left + right;
    case "-": return left - right;
    case "*": return left * right;
    case "/":
      if (right === 0) throw new RangeError("Division by zero");
      return left / right;
    default: throw new TypeError("Unknown operator");
  }
}

for (const entry of cases) {
  test(`calculator learning reference: repeated equals ${entry.label}`, () => {
    let value = entry.initial;
    const trace = [];
    for (let index = 0; index < 5; index += 1) {
      value = apply(value, entry.operator, entry.operand);
      trace.push(value);
    }
    assert.deepEqual(trace, entry.expected);
  });
}

test("calculator learning reference: equals without an operator leaves the entry unchanged", () => {
  const entry = 3;
  const operator = null;
  assert.equal(operator === null ? entry : apply(5, operator, entry), 3);
});

test("calculator learning reference: symmetric half-away-from-zero rounding", () => {
  const rounded = (value, places) => {
    const factor = 10 ** places;
    const magnitude = Math.abs(value) * factor;
    return Math.sign(value) * Math.floor(magnitude + 0.5) / factor;
  };
  assert.equal(rounded(-8 / 3, 9).toFixed(9), "-2.666666667");
  assert.equal(rounded(8 / 3, 9).toFixed(9), "2.666666667");
});
