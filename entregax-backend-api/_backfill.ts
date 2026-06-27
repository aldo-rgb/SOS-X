import { backfillCommissions } from './src/commissionService';
(async () => {
  const r = await backfillCommissions(2000);
  console.log('BACKFILL RESULT:', JSON.stringify(r));
  process.exit(0);
})().catch(e => { console.error('ERR:', e); process.exit(1); });
