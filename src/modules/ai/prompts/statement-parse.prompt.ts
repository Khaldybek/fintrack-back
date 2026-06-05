export function getStatementParseMessages(
  textChunk: string,
  currency: string,
): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    {
      role: 'system',
      content:
        `Extract all financial transactions from bank statement text. Currency: ${currency}. ` +
        'Return amount_minor as signed integer: expenses negative, income positive. ' +
        'For KZT use whole tenge (no cents). Dates as YYYY-MM-DD. Memo = merchant/description. Skip balances and headers.',
    },
    {
      role: 'user',
      content: textChunk,
    },
  ];
}
