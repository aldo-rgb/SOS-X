/**
 * XP864126 — la orden se creó bajo el cliente equivocado.
 *
 * El asesor Víctor García (32) la capturó desde la app teniendo abierto a
 * Carlos Enrique Díaz González (S1531, id 171), pero la operación es de
 * Chelsea Xie (S2779, id 590): los datos fiscales son TODOGLOBO / TOD140509I60,
 * que son de ella, y así se le mandaron a ENTANGLED.
 *
 * POR QUÉ BASTA CON CAMBIAR user_id:
 * A ENTANGLED nunca le mandamos nuestro user_id. Lo que ellos tienen —
 * cliente_final (TODOGLOBO) y beneficiario (Fungram Balloons)— YA es lo
 * correcto para Chelsea. El único dato equivocado vive en nuestra base.
 *
 * Verificado antes de escribir:
 *  - advisor_id = 32 sigue siendo válido: Víctor es asesor de los dos clientes.
 *  - cf_rfc / cf_razon_social ya son los de Chelsea, no se tocan.
 *  - el perfil fiscal de Carlos (171) NO se contaminó: sigue sin fila.
 *  - no hay webhooks, movimientos de monedero ni comisiones ligados a la orden.
 *  - sin comprobante subido, sin factura emitida.
 *
 * SEGUNDA LIMPIEZA — el proveedor guardado:
 * En el MISMO submit (18:25:49, al segundo) se guardó el proveedor Fungram
 * bajo la cuenta de Carlos (entangled_suppliers id 31), con la misma cuenta
 * bancaria 704278247621 que el de Chelsea (id 22, del 29-jul). Carlos nunca
 * estuvo ligado a Fungram: esa fila nació del mismo error, así que se borra.
 * Verificado: la orden tiene supplier_id NULL y ninguna orden apunta al 31.
 *
 * Dry-run por defecto. --apply para escribir.
 */
const { Pool } = require('pg');
require('dotenv').config();

const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const REFERENCIA = 'XP864126';
const DE_USER = 171;   // Carlos Enrique Díaz González · S1531
const A_USER = 590;    // Chelsea Xie · S2779
const SUPPLIER_ERRONEO = 31;  // Fungram guardado por error bajo S1531

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `SELECT id, referencia_pago, user_id, advisor_id, estatus_global,
              entangled_transaccion_id, cf_rfc, cf_razon_social,
              comprobante_subido_at, factura_emitida_at
         FROM entangled_payment_requests
        WHERE referencia_pago = $1 FOR UPDATE`,
      [REFERENCIA]
    );
    const o = r.rows[0];
    if (!o) { console.error('ABORTA: no existe la orden'); await client.query('ROLLBACK'); return; }

    // Guardas: si algo de esto cambió desde el análisis, no se toca.
    const problemas = [];
    if (o.user_id !== DE_USER) problemas.push(`user_id ya no es ${DE_USER} (es ${o.user_id})`);
    if (o.advisor_id !== 32) problemas.push(`advisor_id ya no es 32 (es ${o.advisor_id})`);
    if (o.cf_rfc !== 'TOD140509I60') problemas.push(`cf_rfc cambió (${o.cf_rfc})`);
    if (o.comprobante_subido_at) problemas.push('ya tiene comprobante subido');
    if (o.factura_emitida_at) problemas.push('ya tiene factura emitida');
    if (problemas.length) {
      console.error('ABORTA:', problemas.join(' · '));
      await client.query('ROLLBACK'); return;
    }

    const nombre = async (id) => (await client.query(
      `SELECT box_id, full_name FROM users WHERE id = $1`, [id])).rows[0];
    const de = await nombre(DE_USER), a = await nombre(A_USER);

    console.log(`orden ${o.referencia_pago} (id ${o.id}) · ${o.estatus_global}`);
    console.log(`  transaccion ENTANGLED : ${o.entangled_transaccion_id}  (no se toca)`);
    console.log(`  datos fiscales        : ${o.cf_razon_social} / ${o.cf_rfc}  (correctos, no se tocan)`);
    console.log(`  cliente ANTES         : ${de.box_id} · ${de.full_name}`);
    console.log(`  cliente DESPUÉS       : ${a.box_id} · ${a.full_name}`);

    const upd = await client.query(
      `UPDATE entangled_payment_requests
          SET user_id = $2, updated_at = NOW()
        WHERE id = $1 AND user_id = $3`,
      [o.id, A_USER, DE_USER]
    );
    console.log(`\nfilas actualizadas: ${upd.rowCount}`);

    // ── Proveedor creado por el mismo error ──
    const sup = (await client.query(
      `SELECT es.id, es.alias, es.numero_cuenta, es.created_at
         FROM entangled_suppliers es
        WHERE es.id = $1 AND es.user_id = $2 FOR UPDATE`,
      [SUPPLIER_ERRONEO, DE_USER]
    )).rows[0];
    if (!sup) {
      console.log('proveedor', SUPPLIER_ERRONEO, 'ya no existe o no es de ese cliente: no se toca');
    } else {
      const usos = (await client.query(
        `SELECT COUNT(*)::int AS n FROM entangled_payment_requests WHERE supplier_id = $1`,
        [SUPPLIER_ERRONEO]
      )).rows[0].n;
      if (usos > 0) {
        console.error(`ABORTA: ${usos} orden(es) apuntan al proveedor ${SUPPLIER_ERRONEO}`);
        await client.query('ROLLBACK'); return;
      }
      const del = await client.query(
        `DELETE FROM entangled_suppliers WHERE id = $1 AND user_id = $2`,
        [SUPPLIER_ERRONEO, DE_USER]
      );
      console.log(`proveedor borrado de ${de.box_id}: id ${sup.id} "${sup.alias.trim()}" cuenta ${sup.numero_cuenta} (${del.rowCount} fila)`);
    }

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
