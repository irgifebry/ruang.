import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import crypto from 'node:crypto';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import {
  isRecord,
  validAmount,
  validBudget,
  validDate,
  validExpense,
  validId,
  validIncome,
  validMonths,
} from '@/lib/ledger-validation';
import {
  currentMonthKey,
  monthEnd,
  monthKey,
  monthStart,
  shiftMonth,
  toNumber,
  toPositive,
} from '@/lib/money';

/**
 * The profile row plus the account's provider photo.
 *
 * `"user".image` is where Better Auth keeps the picture Google sent at sign-in.
 * It is read live rather than copied into `profiles` so a user who changes their
 * Google photo sees it here without a migration or a re-sync job, and so
 * `profiles` keeps exactly one meaning for `avatar_path`: an upload the user
 * made themselves. `provider_image` is the fallback for that being null.
 *
 * The column names are quoted because Better Auth's tables use camelCase.
 */
const PROFILE_SELECT = `
  SELECT p.*, nullif(trim(both from u.image), '') AS provider_image
  FROM profiles p
  LEFT JOIN "user" u ON u.id = p.id
  WHERE p.id = $1
`;

function errorResponse(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function readJsonBody(request, maxBytes) {
  if (!request.body) throw new Error('JSON tidak valid.');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return { tooLarge: true };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { body: JSON.parse(text) };
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return errorResponse('Permintaan ditolak.', 403);
    }
    if (!origin && request.headers.get('sec-fetch-site') === 'cross-site') {
      return errorResponse('Permintaan ditolak.', 403);
    }

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 16_384) return errorResponse('Permintaan terlalu besar.', 413);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return errorResponse('Content-Type harus application/json.', 415);
    }

    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Sesi tidak ditemukan. Silakan masuk kembali.' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const pool = getPool();
    let parsed;
    let body;
    try {
      parsed = await readJsonBody(request, 16_384);
    } catch {
      return errorResponse('JSON tidak valid.');
    }
    if (parsed.tooLarge) return errorResponse('Permintaan terlalu besar.', 413);
    body = parsed.body;
    if (!isRecord(body)) return errorResponse('Data permintaan tidak valid.');
    const { action } = body;
    if (typeof action !== 'string') return errorResponse('Aksi tidak dikenal.');

    switch (action) {
      case 'fetchLedger': {
        const currentMonth = monthStart(new Date());

        const [profileRes, budgetsRes, expensesRes, salaryRes, incomesRes] = await Promise.all([
          pool.query(PROFILE_SELECT, [userId]),
          pool.query('SELECT * FROM budgets WHERE user_id = $1 ORDER BY created_at ASC', [userId]),
          pool.query(
            `SELECT 
              e.id, 
              e.user_id, 
              e.category_id, 
              e.description, 
              e.amount::numeric, 
              to_char(e.spent_on, 'YYYY-MM-DD') AS spent_on, 
              e.created_at,
              json_build_object('id', b.id, 'name', b.name, 'color', b.color) AS budgets
            FROM expenses e
            JOIN budgets b ON e.category_id = b.id
            WHERE e.user_id = $1
            ORDER BY e.spent_on DESC, e.created_at DESC`,
            [userId]
          ),
          pool.query(
            `SELECT user_id, to_char(month, 'YYYY-MM-DD') AS month, amount::numeric, updated_at
            FROM salary_records
            WHERE user_id = $1
            ORDER BY month DESC`,
            [userId]
          ),
          // Unpaged, like `expenses`: the transactions screen filters by month
          // in the browser and a salary that lands on the 28th must not fall
          // out of the set because it was the newest row in a long history.
          pool.query(
            `SELECT id, description, source, amount::numeric,
              to_char(received_on, 'YYYY-MM-DD') AS received_on, created_at
            FROM incomes
            WHERE user_id = $1
            ORDER BY received_on DESC, created_at DESC`,
            [userId]
          ),
        ]);

        const profile = profileRes.rows[0] ?? null;
        const budgets = budgetsRes.rows.map((b) => ({
          ...b,
          monthly_limit: toNumber(b.monthly_limit),
        }));
        const expenses = expensesRes.rows.map((e) => ({
          ...e,
          amount: toNumber(e.amount),
        }));
        const salaryRecords = salaryRes.rows.map((r) => ({
          key: monthKey(r.month),
          month: r.month,
          amount: toNumber(r.amount),
          updatedAt: r.updated_at,
        }));
        const incomes = incomesRes.rows.map((row) => ({
          ...row,
          // A blank label is stored as NULL by the API, but an empty string from
          // an older row would render as an empty meta line rather than falling
          // back to the generic wording.
          source: row.source || null,
          amount: toNumber(row.amount),
        }));

        const currentSalaryRow = salaryRecords.find((r) => r.month === currentMonth);
        const salary = toPositive(currentSalaryRow?.amount ?? profile?.salary);

        const series =
          salaryRecords.length === 0 && salary > 0
            ? [{ key: currentMonthKey(), month: currentMonth, amount: salary, updatedAt: null }]
            : salaryRecords;

        return NextResponse.json({
          profile,
          salary,
          budgets,
          expenses,
          incomes,
          salaryRecords: series,
        });
      }

      case 'fetchSalaryHistory': {
        const months = body.months === undefined ? 12 : Number(body.months);
        if (!validMonths(months)) return errorResponse('Rentang bulan tidak valid.');
        const res = await pool.query(
          `SELECT user_id, to_char(month, 'YYYY-MM-DD') AS month, amount::numeric, updated_at
          FROM salary_records
          WHERE user_id = $1
          ORDER BY month DESC
          LIMIT $2`,
          [userId, months]
        );
        const records = res.rows.map((r) => ({
          key: monthKey(r.month),
          month: r.month,
          amount: toNumber(r.amount),
          updatedAt: r.updated_at,
        }));
        return NextResponse.json(records);
      }

      case 'fetchMonthlyBreakdown': {
        const months = body.months === undefined ? 12 : Number(body.months);
        if (!validMonths(months)) return errorResponse('Rentang bulan tidak valid.');
        const oldestMonth = shiftMonth(currentMonthKey(), -(months - 1));
        const windowStart = `${oldestMonth}-01`;

        const [budgetsRes, expensesRes, incomesRes] = await Promise.all([
          pool.query('SELECT * FROM budgets WHERE user_id = $1 ORDER BY created_at ASC', [userId]),
          pool.query(
            `SELECT 
              e.id, 
              e.user_id, 
              e.category_id, 
              e.description, 
              e.amount::numeric, 
              to_char(e.spent_on, 'YYYY-MM-DD') AS spent_on, 
              e.created_at,
              json_build_object('id', b.id, 'name', b.name, 'color', b.color) AS budgets
            FROM expenses e
            JOIN budgets b ON e.category_id = b.id
            WHERE e.user_id = $1 AND e.spent_on >= $2
            ORDER BY e.spent_on DESC, e.created_at DESC`,
            [userId, windowStart]
          ),
          // Same window as the expenses, so the two aggregates in a history row
          // describe the same months rather than two slightly different ranges.
          pool.query(
            `SELECT id, description, source, amount::numeric,
              to_char(received_on, 'YYYY-MM-DD') AS received_on
            FROM incomes
            WHERE user_id = $1 AND received_on >= $2
            ORDER BY received_on DESC, created_at DESC`,
            [userId, windowStart]
          ),
        ]);

        const budgets = budgetsRes.rows.map((b) => ({
          ...b,
          monthly_limit: toNumber(b.monthly_limit),
        }));

        const byMonth = {};
        for (const expense of expensesRes.rows) {
          const key = monthKey(expense.spent_on);
          if (!byMonth[key]) byMonth[key] = [];
          byMonth[key].push({
            ...expense,
            amount: toNumber(expense.amount),
          });
        }

        const incomesByMonth = {};
        for (const income of incomesRes.rows) {
          const key = monthKey(income.received_on);
          if (!incomesByMonth[key]) incomesByMonth[key] = [];
          incomesByMonth[key].push({
            ...income,
            source: income.source || null,
            amount: toNumber(income.amount),
          });
        }

        return NextResponse.json({ budgets, byMonth, incomesByMonth });
      }

      case 'fetchProfile': {
        const res = await pool.query(PROFILE_SELECT, [userId]);
        return NextResponse.json(res.rows[0] ?? null);
      }

      case 'createExpense': {
        const { input } = body;
        if (!validExpense(input)) return errorResponse('Data pengeluaran tidak valid.');
        const id = crypto.randomUUID();
        const result = await pool.query(
          `INSERT INTO expenses (id, user_id, category_id, description, amount, spent_on)
          SELECT $1, $2, b.id, $4, $5, $6
          FROM budgets b WHERE b.id = $3 AND b.user_id = $2
          RETURNING id`,
          [id, userId, input.categoryId, input.description.trim(), input.amount, input.spentOn]
        );
        if (!result.rowCount) return errorResponse('Kategori tidak ditemukan.', 404);
        return NextResponse.json({ success: true, id });
      }

      case 'updateExpense': {
        const { id, input } = body;
        if (!validId(id) || !validExpense(input)) return errorResponse('Data pengeluaran tidak valid.');
        const result = await pool.query(
          `UPDATE expenses
          SET category_id = $1, description = $2, amount = $3, spent_on = $4
          WHERE id = $5 AND user_id = $6
            AND EXISTS (SELECT 1 FROM budgets WHERE id = $1 AND user_id = $6)`,
          [input.categoryId, input.description.trim(), input.amount, input.spentOn, id, userId]
        );
        if (!result.rowCount) return errorResponse('Pengeluaran atau kategori tidak ditemukan.', 404);
        return NextResponse.json({ success: true });
      }

      case 'deleteExpense': {
        const { id } = body;
        if (!validId(id)) return errorResponse('ID pengeluaran tidak valid.');
        const result = await pool.query('DELETE FROM expenses WHERE id = $1 AND user_id = $2', [id, userId]);
        if (!result.rowCount) return errorResponse('Pengeluaran tidak ditemukan.', 404);
        return NextResponse.json({ success: true });
      }

      case 'createIncome': {
        const { input } = body;
        if (!validIncome(input)) return errorResponse('Data pemasukan tidak valid.');
        const id = crypto.randomUUID();
        await pool.query(
          `INSERT INTO incomes (id, user_id, description, source, amount, received_on)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            id,
            userId,
            input.description.trim(),
            // An empty label is stored as NULL so the row never carries a blank
            // string that would render as an empty meta line.
            input.source?.trim() || null,
            input.amount,
            input.receivedOn,
          ]
        );
        return NextResponse.json({ success: true, id });
      }

      case 'updateIncome': {
        const { id, input } = body;
        if (!validId(id) || !validIncome(input)) return errorResponse('Data pemasukan tidak valid.');
        const result = await pool.query(
          `UPDATE incomes
           SET description = $1, source = $2, amount = $3, received_on = $4
           WHERE id = $5 AND user_id = $6`,
          [input.description.trim(), input.source?.trim() || null, input.amount, input.receivedOn, id, userId]
        );
        if (!result.rowCount) return errorResponse('Pemasukan tidak ditemukan.', 404);
        return NextResponse.json({ success: true });
      }

      case 'deleteIncome': {
        const { id } = body;
        if (!validId(id)) return errorResponse('ID pemasukan tidak valid.');
        const result = await pool.query('DELETE FROM incomes WHERE id = $1 AND user_id = $2', [id, userId]);
        if (!result.rowCount) return errorResponse('Pemasukan tidak ditemukan.', 404);
        return NextResponse.json({ success: true });
      }

      case 'createBudget': {
        const { input } = body;
        if (!validBudget(input)) return errorResponse('Data kategori tidak valid.');
        const id = crypto.randomUUID();
        await pool.query(
          `INSERT INTO budgets (id, user_id, name, monthly_limit, color)
          VALUES ($1, $2, $3, $4, $5)`,
          [id, userId, input.name.trim(), input.monthlyLimit, input.color]
        );
        return NextResponse.json({ success: true, id });
      }

      case 'updateBudget': {
        const { id, input } = body;
        if (!validId(id) || !validBudget(input)) return errorResponse('Data kategori tidak valid.');
        const result = await pool.query(
          `UPDATE budgets
          SET name = $1, monthly_limit = $2, color = $3
          WHERE id = $4 AND user_id = $5`,
          [input.name.trim(), input.monthlyLimit, input.color, id, userId]
        );
        if (!result.rowCount) return errorResponse('Kategori tidak ditemukan.', 404);
        return NextResponse.json({ success: true });
      }

      case 'deleteBudget': {
        const { id } = body;
        if (!validId(id)) return errorResponse('ID kategori tidak valid.');
        const result = await pool.query('DELETE FROM budgets WHERE id = $1 AND user_id = $2', [id, userId]);
        if (!result.rowCount) return errorResponse('Kategori tidak ditemukan.', 404);
        return NextResponse.json({ success: true });
      }

      case 'saveSalary': {
        const { month, amount } = body;
        if (!validDate(month, true) || !validAmount(amount, true)) {
          return errorResponse('Data gaji tidak valid.');
        }
        await pool.query(
          `INSERT INTO salary_records (user_id, month, amount, updated_at)
          VALUES ($1, $2, $3, now())
          ON CONFLICT (user_id, month)
          DO UPDATE SET amount = EXCLUDED.amount, updated_at = now()`,
          [userId, month, amount]
        );

        if (monthKey(month) === currentMonthKey()) {
          await pool.query('UPDATE profiles SET salary = $1 WHERE id = $2', [amount, userId]);
        }
        return NextResponse.json({ success: true });
      }

      case 'updateProfile': {
        const { patch } = body;
        if (!isRecord(patch) || Object.keys(patch).length === 0 ||
            Object.keys(patch).some((key) => !['name', 'theme', 'avatar_path', 'provider_image'].includes(key))) {
          return errorResponse('Data profil tidak valid.');
        }
        if ('name' in patch && patch.name !== null &&
            (typeof patch.name !== 'string' || patch.name.trim().length < 1 || patch.name.trim().length > 60)) {
          return errorResponse('Nama tidak valid.');
        }
        if ('theme' in patch && !['dark', 'light', 'system'].includes(patch.theme)) {
          return errorResponse('Tema tidak valid.');
        }
        if ('avatar_path' in patch && patch.avatar_path !== null &&
            (typeof patch.avatar_path !== 'string' || patch.avatar_path.length > 300 ||
             !patch.avatar_path.startsWith(`${userId}/`) ||
             !/^avatar-[0-9a-f-]{36}\.(jpg|png|webp|gif)$/i.test(patch.avatar_path.slice(userId.length + 1)))) {
          return errorResponse('Path avatar tidak valid.');
        }
        if ('provider_image' in patch && patch.provider_image !== null) {
          return errorResponse('Foto penyedia hanya dapat dihapus.');
        }
        const fields = [];
        const values = [];
        let idx = 1;

        if ('name' in patch) {
          fields.push(`name = $${idx++}`);
          values.push(patch.name?.trim() || null);
        }
        if ('theme' in patch) {
          fields.push(`theme = $${idx++}`);
          values.push(patch.theme);
        }
        if ('avatar_path' in patch) {
          fields.push(`avatar_path = $${idx++}`);
          values.push(patch.avatar_path);
        }

        if (fields.length > 0) {
          values.push(userId);
          await pool.query(`UPDATE profiles SET ${fields.join(', ')} WHERE id = $${idx}`, values);

          if ('name' in patch && patch.name) {
            await pool.query('UPDATE "user" SET name = $1 WHERE id = $2', [patch.name.trim(), userId]);
          }
        }

        // The provider photo is not a `profiles` column — it is the picture
        // Google handed over at sign-in, stored on `"user".image`. Only clearing
        // it is allowed: accepting a URL from the browser would let the client
        // point the avatar at anything, including a tracking pixel. A new photo
        // comes from Google itself, or from an upload into `avatar_path`.
        if ('provider_image' in patch) {
          await pool.query('UPDATE "user" SET image = $1 WHERE id = $2', [
            patch.provider_image ?? null,
            userId,
          ]);
        }

        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Aksi tidak dikenal.' }, { status: 400 });
    }
  } catch (err) {
    console.error('Ledger API error:', err);
    return NextResponse.json({ error: 'Terjadi kesalahan pada server.' }, { status: 500 });
  }
}
