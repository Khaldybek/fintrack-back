export function getStatementDetectMessages(sampleText: string): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    {
      role: 'system',
      content:
        'You analyze bank statement file samples (CSV/XLSX tab-separated preview). ' +
        'Detect bank (kaspi, halyk, or generic) and zero-based column indices for date, amount or debit/credit, and description/memo. ' +
        'header_row_index is the row with column headers. Use null for unused amount/debit/credit columns.',
    },
    {
      role: 'user',
      content: `Statement sample (first rows):\n${sampleText}`,
    },
  ];
}
