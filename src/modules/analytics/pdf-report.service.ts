import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { join } from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');
import { Account } from '../accounts/entities/account.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { formatMoney } from '../../common/money.util';
import type { User } from '../users/entities/user.entity';

// In dev (ts-node): src/assets/fonts; in prod (dist): dist/assets/fonts (copied by nest-cli assets)
function resolveFontPath(filename: string): string {
  const candidates = [
    join(__dirname, 'assets', 'fonts', filename),           // dist/assets/fonts
    join(__dirname, '..', 'assets', 'fonts', filename),     // dist/modules/../assets
    join(__dirname, '..', '..', 'assets', 'fonts', filename), // deeper nesting
    join(process.cwd(), 'src', 'assets', 'fonts', filename), // ts-node dev
    join(process.cwd(), 'dist', 'assets', 'fonts', filename), // prod fallback
  ];
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[3];
}

const FONT_REGULAR = resolveFontPath('Roboto-Regular.ttf');
const FONT_BOLD = resolveFontPath('Roboto-Bold.ttf');

const MONTHS_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

@Injectable()
export class PdfReportService {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
  ) {}

  async generateMonthlyReport(user: User, year: number, month: number): Promise<Buffer> {
    const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const dateTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const accounts = await this.accountRepo.find({ where: { userId: user.id } });
    const accountIds = accounts.map((a) => a.id);

    if (accountIds.length === 0) {
      return this.buildPdf(user, year, month, dateFrom, dateTo, [], [], 0, 0);
    }

    // Транзакции за месяц
    const transactions = await this.txRepo
      .createQueryBuilder('t')
      .innerJoin('categories', 'c', 'c.id = t.category_id')
      .select([
        't.id as id',
        't.date::text as date',
        't.amount_minor as amount_minor',
        't.currency as currency',
        't.memo as memo',
        'c.name as category_name',
        'c.type as category_type',
      ])
      .where('t.account_id IN (:...accountIds)', { accountIds })
      .andWhere('t.date >= :dateFrom', { dateFrom })
      .andWhere('t.date <= :dateTo', { dateTo })
      .andWhere('t.deleted_at IS NULL')
      .orderBy('t.date', 'ASC')
      .getRawMany();

    // Сводка по категориям
    const categoryRows = await this.txRepo
      .createQueryBuilder('t')
      .innerJoin('categories', 'c', 'c.id = t.category_id')
      .select('c.name', 'name')
      .addSelect('c.type', 'type')
      .addSelect('SUM(CASE WHEN t.amount_minor > 0 THEN t.amount_minor ELSE 0 END)', 'income')
      .addSelect('SUM(CASE WHEN t.amount_minor < 0 THEN ABS(t.amount_minor) ELSE 0 END)', 'expense')
      .where('t.account_id IN (:...accountIds)', { accountIds })
      .andWhere('t.date >= :dateFrom', { dateFrom })
      .andWhere('t.date <= :dateTo', { dateTo })
      .andWhere('t.deleted_at IS NULL')
      .groupBy('c.name')
      .addGroupBy('c.type')
      .orderBy('expense', 'DESC')
      .getRawMany();

    const totalIncome = transactions.filter((t) => Number(t.amount_minor) > 0).reduce((s, t) => s + Number(t.amount_minor), 0);
    const totalExpense = transactions.filter((t) => Number(t.amount_minor) < 0).reduce((s, t) => s + Math.abs(Number(t.amount_minor)), 0);

    return this.buildPdf(user, year, month, dateFrom, dateTo, transactions, categoryRows, totalIncome, totalExpense);
  }

  private buildPdf(
    user: User,
    year: number,
    month: number,
    dateFrom: string,
    dateTo: string,
    transactions: Record<string, string>[],
    categories: Record<string, string>[],
    totalIncome: number,
    totalExpense: number,
  ): Promise<Buffer> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      doc.registerFont('Regular', FONT_REGULAR);
      doc.registerFont('Bold', FONT_BOLD);
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      const currency = 'KZT';
      const net = totalIncome - totalExpense;
      const monthName = `${MONTHS_RU[month - 1]} ${year}`;

      // ── Шапка ─────────────────────────────────────────────
      doc.fontSize(20).font('Bold').text('FinTrack', 40, 40);
      doc.fontSize(12).font('Regular').fillColor('#555555')
        .text(`Месячный отчёт: ${monthName}`, 40, 68);
      doc.fillColor('#000000').text(`Период: ${dateFrom} — ${dateTo}`, 40, 84);
      if (user.name) doc.text(`Пользователь: ${user.name}`, 40, 100);
      doc.moveTo(40, 118).lineTo(555, 118).strokeColor('#cccccc').stroke();

      // ── Сводка ────────────────────────────────────────────
      doc.fontSize(14).font('Bold').fillColor('#000000').text('Сводка', 40, 130);

      const summaryY = 150;
      this.drawRow(doc, summaryY, 'Доходы', formatMoney(totalIncome, currency), '#16a34a');
      this.drawRow(doc, summaryY + 22, 'Расходы', formatMoney(totalExpense, currency), '#dc2626');
      this.drawRow(
        doc,
        summaryY + 44,
        'Баланс месяца',
        formatMoney(net, currency),
        net >= 0 ? '#16a34a' : '#dc2626',
      );
      this.drawRow(doc, summaryY + 66, 'Транзакций', String(transactions.length), '#000000');

      doc.moveTo(40, summaryY + 88).lineTo(555, summaryY + 88).strokeColor('#cccccc').stroke();

      // ── По категориям ─────────────────────────────────────
      let y = summaryY + 103;
      doc.fontSize(14).font('Bold').fillColor('#000000').text('По категориям', 40, y);
      y += 22;

      if (categories.length === 0) {
        doc.fontSize(11).font('Regular').fillColor('#888888').text('Нет данных', 40, y);
        y += 20;
      } else {
        doc.fontSize(10).font('Regular').fillColor('#888888');
        doc.text('Категория', 40, y).text('Тип', 230, y).text('Доходы', 310, y).text('Расходы', 420, y);
        y += 16;
        doc.moveTo(40, y).lineTo(555, y).strokeColor('#eeeeee').stroke();
        y += 5;
        doc.fillColor('#000000');

        for (const c of categories) {
          if (y > 720) { doc.addPage(); y = 40; }
          doc.fontSize(10).font('Regular');
          doc.text(String(c.name ?? '').slice(0, 24), 40, y, { width: 185 });
          doc.text(c.type === 'income' ? 'Доход' : 'Расход', 230, y);
          doc.fillColor('#16a34a').text(formatMoney(Number(c.income) || 0, currency), 310, y);
          doc.fillColor('#dc2626').text(formatMoney(Number(c.expense) || 0, currency), 420, y);
          doc.fillColor('#000000');
          y += 18;
        }
      }

      y += 10;
      doc.moveTo(40, y).lineTo(555, y).strokeColor('#cccccc').stroke();
      y += 15;

      // ── Транзакции ────────────────────────────────────────
      doc.fontSize(14).font('Bold').fillColor('#000000').text('Транзакции', 40, y);
      y += 22;

      if (transactions.length === 0) {
        doc.fontSize(11).font('Regular').fillColor('#888888').text('Нет транзакций за период', 40, y);
      } else {
        doc.fontSize(9).font('Regular').fillColor('#888888');
        doc.text('Дата', 40, y).text('Категория', 110, y).text('Заметка', 255, y).text('Сумма', 455, y);
        y += 14;
        doc.moveTo(40, y).lineTo(555, y).strokeColor('#eeeeee').stroke();
        y += 4;
        doc.fillColor('#000000');

        for (const t of transactions) {
          if (y > 750) { doc.addPage(); y = 40; }
          const amt = Number(t.amount_minor);
          const color = amt >= 0 ? '#16a34a' : '#dc2626';
          doc.fontSize(9).font('Regular').fillColor('#000000');
          doc.text(String(t.date ?? ''), 40, y);
          doc.text(String(t.category_name ?? '').slice(0, 18), 110, y);
          doc.text(String(t.memo ?? '').slice(0, 22), 255, y);
          doc.fillColor(color).text(formatMoney(amt, String(t.currency ?? currency)), 455, y);
          doc.fillColor('#000000');
          y += 16;
        }
      }

      // ── Футер ─────────────────────────────────────────────
      doc.fontSize(8).font('Regular').fillColor('#aaaaaa').text(
        `Сгенерировано: ${new Date().toLocaleString('ru-KZ')}`,
        40,
        doc.page.height - 30,
        { align: 'center' },
      );

      doc.end();
    });
  }

  private drawRow(doc: PDFKit.PDFDocument, y: number, label: string, value: string, color: string) {
    doc.fontSize(11).font('Regular').fillColor('#333333').text(label, 40, y);
    doc.fillColor(color).font('Bold').text(value, 300, y);
    doc.fillColor('#000000').font('Regular');
  }
}
