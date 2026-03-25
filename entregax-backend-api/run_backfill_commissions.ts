import { backfillCommissions } from './src/commissionService';

async function main() {
  console.log('Iniciando backfill de comisiones...');
  const result = await backfillCommissions(1000);
  console.log('Resultado:', JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
