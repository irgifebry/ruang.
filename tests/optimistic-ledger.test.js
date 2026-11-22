import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBudgetWrite,
  applyExpenseWrite,
  applyIncomeWrite,
  applyProfileWrite,
  removeBudget,
  removeLedgerRow,
} from '../src/lib/optimistic-ledger.js';

const ledger = () => ({
  profile: { id: 'u1', name: 'Irgi' },
  budgets: [{ id: 'b1', name: 'Makan', monthly_limit: 100000, color: 'lime' }],
  expenses: [
    {
      id: 'e1',
      category_id: 'b1',
      description: 'Lama',
      amount: 1000,
      spent_on: '2026-11-20',
      created_at: 'old',
      user_id: 'u1',
      budgets: { id: 'b1', name: 'Makan', color: 'lime' },
    },
  ],
  incomes: [{ id: 'i1', description: 'Gaji', amount: 2500000, received_on: '2026-11-01' }],
});

test('a new expense appears immediately with the category label attached', () => {
  const next = applyExpenseWrite(ledger(), {
    id: 'e2',
    input: { description: ' Kopi ', amount: '12000', categoryId: 'b1', spentOn: '2026-11-22' },
  });
  assert.equal(next.expenses.length, 2);
  const row = next.expenses[0];
  assert.equal(row.description, 'Kopi');
  assert.equal(row.amount, 12000);
  assert.deepEqual(row.budgets, { id: 'b1', name: 'Makan', color: 'lime' });
});

test('editing an expense keeps its id and original created_at', () => {
  const next = applyExpenseWrite(ledger(), {
    editingId: 'e1',
    input: { description: 'Baru', amount: '2000', categoryId: 'b1', spentOn: '2026-11-21' },
  });
  assert.equal(next.expenses.length, 1);
  assert.equal(next.expenses[0].id, 'e1');
  assert.equal(next.expenses[0].created_at, 'old');
  assert.equal(next.expenses[0].description, 'Baru');
});

test('income stores an empty source as null', () => {
  const next = applyIncomeWrite(ledger(), {
    id: 'i2',
    input: { description: 'Bonus', amount: '50000', source: '   ', receivedOn: '2026-11-22' },
  });
  assert.equal(next.incomes[0].source, null);
  assert.equal(next.incomes[0].amount, 50000);
});

test('a delete removes the row from whichever table it came from', () => {
  expectRemoved(removeLedgerRow(ledger(), 'e1'), 'expenses');
  expectRemoved(removeLedgerRow(ledger(), 'i1'), 'incomes');
});

function expectRemoved(next, key) {
  const other = key === 'expenses' ? 'incomes' : 'expenses';
  assert.equal(next[key].length, 0);
  assert.equal(next[other].length, 1);
}

test('budget writes and removals keep the local list in sync', () => {
  const added = applyBudgetWrite(ledger(), {
    id: 'b2',
    input: { name: 'Transport', monthlyLimit: '250000', color: 'blue' },
  });
  assert.equal(added.budgets.length, 2);
  assert.equal(added.budgets[1].monthly_limit, 250000);

  const edited = applyBudgetWrite(added, {
    editingId: 'b2',
    input: { name: 'Transport', monthlyLimit: '300000', color: 'blue' },
  });
  assert.equal(edited.budgets[1].monthly_limit, 300000);
  assert.equal(removeBudget(edited, 'b2').budgets.length, 1);
});

test('profile patches merge into the existing row', () => {
  const next = applyProfileWrite(ledger(), { name: 'Irgi Baru' });
  assert.equal(next.profile.id, 'u1');
  assert.equal(next.profile.name, 'Irgi Baru');
});
