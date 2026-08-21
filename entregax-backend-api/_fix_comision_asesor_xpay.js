/**
 * Comisión de asesor calculada sobre el % equivocado (XP346889 y XP756780).
 *
 * La app móvil usaba el % que capturaba el asesor para COBRARLE al cliente,
 * pero no lo mandaba al crear la solicitud. El backend caía entonces al %
 * configurado, así que quedó registrado uno y se cobró otro — y la comisión
 * del asesor se calcula sobre el registrado.
 *
 *   XP346889 · Jorge Campos (23)  · cobró 8%   · registrado 6.00%
 *   XP756780 · Paula Campos (24)  · cobró 6%   · registrado 5.50%
 *
 * La comisión vive en advisor_commissions con la fórmula de commissionService:
 *   rate = comision_cliente_final_% − comision_cobrada_% − %EntregaX
 * Como es lineal en el % al cliente, la diferencia es simplemente
 * (% cobrado − % registrado) × base.
 *
 * Ambas filas están en 'pending': se corrigen ANTES de pagarse, no se
 * reembolsa nada. El bug de origen ya está corregido (commit bae453c).
 *
 * Dry-run por defecto. --apply para escribir.
 */
const { Pool } = require('pg');
require('dotenv').config();

const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// referencia → % que la UI realmente le cobró al cliente
const COBRADO_REAL = { XP346889: 8, XP756780: 6 };

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT ac.id AS com_id, ac.advisor_id, ac.advisor_name, ac.tracking,
              ac.payment_amount_mxn AS base, ac.commission_rate_pct AS pct_actual,
              ac.commission_amount_mxn AS monto_actual, ac.status,
              ac.paid_to_advisor_at, ac.penalized, ac.leader_id,
              e.id AS req_id, e.comision_cliente_final_porcentaje AS ccf,
              e.comision_asesor AS pct_asesor_req, e.estatus_global
         FROM advisor_commissions ac
         JOIN entangled_payment_requests e
           ON e.referencia_pago = ac.tracking AND ac.shipment_type = 'XPAY'
        WHERE ac.tracking = ANY($1)
        ORDER BY ac.tracking
        FOR UPDATE OF ac, e`,
      [Object.keys(COBRADO_REAL)]
    );

    if (rows.length !== 2) {
      console.error(`ABORTA: se esperaban 2 comisiones, se encontraron ${rows.length}`);
      await client.query('ROLLBACK'); return;
    }

    let totalDif = 0;
    for (const r of rows) {
      const cobrado = COBRADO_REAL[r.tracking];
      const registrado = Number(r.ccf);
      const base = Number(r.base);

      // Guardas: si ya se pagó, se penalizó o el % ya está corregido, no se toca.
      const problemas = [];
      if (r.status !== 'pending') problemas.push(`status es '${r.status}', no 'pending'`);
      if (r.paid_to_advisor_at) problemas.push('ya se le pagó al asesor');
      if (r.penalized) problemas.push('está penalizada');
      if (r.leader_id) problemas.push('tiene líder con override — revisar la cascada a mano');
      if (Math.abs(registrado - cobrado) < 0.001) problemas.push('el % registrado ya coincide con el cobrado');
      if (problemas.length) {
        console.error(`ABORTA en ${r.tracking}: ${problemas.join(' · ')}`);
        await client.query('ROLLBACK'); return;
      }

      const deltaPct = cobrado - registrado;
      const pctNuevo = Number((Number(r.pct_actual) + deltaPct).toFixed(4));
      const montoNuevo = Number((base * pctNuevo / 100).toFixed(2));
      const dif = Number((montoNuevo - Number(r.monto_actual)).toFixed(2));
      totalDif += dif;

      console.log(`${r.tracking} · ${r.advisor_name} (asesor ${r.advisor_id}) · solicitud ${r.estatus_global}`);
      console.log(`   base                 $${base.toFixed(2)}`);
      console.log(`   % al cliente         registrado ${registrado}%  →  cobrado real ${cobrado}%`);
      console.log(`   % de comisión        ${r.pct_actual}%  →  ${pctNuevo}%`);
      console.log(`   comisión             $${Number(r.monto_actual).toFixed(2)}  →  $${montoNuevo.toFixed(2)}   (faltaban $${dif.toFixed(2)})`);

      await client.query(
        `UPDATE advisor_commissions
            SET commission_rate_pct = $2, commission_amount_mxn = $3, updated_at = NOW()
          WHERE id = $1 AND status = 'pending' AND paid_to_advisor_at IS NULL`,
        [r.com_id, pctNuevo, montoNuevo]
      );

      // Dejar la solicitud consistente con lo que de verdad se le cobró al
      // cliente, para que cualquier recálculo posterior dé lo mismo.
      // OJO: a ENTANGLED se le mandó en su momento el % viejo.
      await client.query(
        `UPDATE entangled_payment_requests
            SET comision_cliente_final_porcentaje = $2,
                comision_asesor = $3,
                updated_at = NOW()
          WHERE id = $1`,
        [r.req_id, cobrado, Number((Number(r.pct_asesor_req) + deltaPct).toFixed(4))]
      );
      console.log('');
    }

    console.log(`total a acreditar: $${totalDif.toFixed(2)}`);
    if (APPLY) { await client.query('COMMIT'); console.log('APLICADO.'); }
    else { await client.query('ROLLBACK'); console.log('DRY-RUN (sin cambios). Usa --apply para escribir.'); }
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ERROR, rollback:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
})();
