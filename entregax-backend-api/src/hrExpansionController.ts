// ============================================
// HR EXPANSION CONTROLLER
// Expediente Digital, Nómina, Seguro, Préstamos y Pagaré Interno
// - Validación LFT México: descuento por préstamo ≤ 30% del excedente
//   sobre el salario mínimo (Art. 110 LFT)
// ============================================

import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { pool } from './db';
import { uploadToS3, isS3Configured, getSignedUrlForKey } from './s3Service';
import { getEditableLegalDoc, ADVISOR_FALLBACK } from './hrController';

// ---- Constantes legales MX ----
// Salario mínimo general 2025 (zona libre frontera norte / general).
// Se puede ajustar desde la tabla `hr_legal_settings` cuando exista.
const SALARIO_MINIMO_DIARIO_MX_DEFAULT = 278.80; // MXN/día

// ---- Document slots (Expediente Digital) ----
export const EMPLOYEE_DOC_TYPES = [
  'ine_front',
  'ine_back',
  'contract',
  'comprobante_domicilio',
  'rfc',
  'curp',
  'nss_constancia',
  'aviso_alta_imss',
  'pagare',           // generado por el sistema cuando hay préstamo
  'otro',
] as const;

export type EmployeeDocType = (typeof EMPLOYEE_DOC_TYPES)[number];

const DOC_LABELS: Record<EmployeeDocType, string> = {
  ine_front: 'INE — Anverso',
  ine_back: 'INE — Reverso',
  contract: 'Contrato Laboral',
  comprobante_domicilio: 'Comprobante de Domicilio',
  rfc: 'RFC / Constancia de Situación Fiscal',
  curp: 'CURP',
  nss_constancia: 'Constancia NSS',
  aviso_alta_imss: 'Aviso de Alta IMSS',
  pagare: 'Pagaré Interno',
  otro: 'Otro Documento',
};

// ============================================
// Idempotent migration
// ============================================
let migrated = false;
export const ensureHRTables = async () => {
  if (migrated) return;

  // Columns en users que necesitamos
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS rfc_url TEXT,
      ADD COLUMN IF NOT EXISTS curp_url TEXT,
      ADD COLUMN IF NOT EXISTS comprobante_domicilio_url TEXT,
      ADD COLUMN IF NOT EXISTS contract_pdf_url TEXT;
  `);

  // Documentos del empleado
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_documents (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      doc_type     VARCHAR(40) NOT NULL,
      filename     VARCHAR(255),
      url          TEXT NOT NULL,
      storage_key  TEXT,
      mime_type    VARCHAR(80),
      size_bytes   BIGINT,
      expires_at   DATE,
      notes        TEXT,
      uploaded_by  INTEGER,
      uploaded_at  TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_emp_docs_user ON employee_documents(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_emp_docs_type ON employee_documents(user_id, doc_type);`);

  // Información de nómina
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_payroll_info (
      user_id              INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      salario_bruto        NUMERIC(12,2) DEFAULT 0,
      salario_neto         NUMERIC(12,2) DEFAULT 0,
      sdi                  NUMERIC(12,2) DEFAULT 0,
      nss                  VARCHAR(20),
      imss_status          VARCHAR(20) DEFAULT 'pendiente',
      imss_alta_date       DATE,
      imss_baja_date       DATE,
      vacation_days_available INTEGER DEFAULT 12,
      vacation_days_taken     INTEGER DEFAULT 0,
      contract_type        VARCHAR(30) DEFAULT 'indeterminado',
      contract_end_date    DATE,
      payment_period       VARCHAR(20) DEFAULT 'quincenal',
      bank_name            VARCHAR(120),
      bank_clabe           VARCHAR(40),
      bank_account         VARCHAR(40),
      notes                TEXT,
      updated_by           INTEGER,
      updated_at           TIMESTAMP DEFAULT NOW()
    );
  `);

  // Préstamos
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_loans (
      id                       SERIAL PRIMARY KEY,
      user_id                  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      monto_total              NUMERIC(12,2) NOT NULL,
      motivo                   TEXT,
      parcialidades            INTEGER NOT NULL,
      monto_por_parcialidad    NUMERIC(12,2) NOT NULL,
      periodo                  VARCHAR(20) DEFAULT 'quincenal',
      fecha_solicitud          TIMESTAMP DEFAULT NOW(),
      fecha_inicio_descuentos  DATE,
      status                   VARCHAR(20) DEFAULT 'active',
      pagare_pdf_url           TEXT,
      pagare_html              TEXT,
      lft_max_descuento        NUMERIC(12,2),
      salario_bruto_snapshot   NUMERIC(12,2),
      salario_minimo_snapshot  NUMERIC(12,2),
      created_by               INTEGER,
      created_at               TIMESTAMP DEFAULT NOW(),
      cancelled_at             TIMESTAMP,
      paid_off_at              TIMESTAMP
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_emp_loans_user ON employee_loans(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_emp_loans_status ON employee_loans(status);`);

  // Abonos a préstamos
  await pool.query(`
    CREATE TABLE IF NOT EXISTS loan_payments (
      id              SERIAL PRIMARY KEY,
      loan_id         INTEGER NOT NULL REFERENCES employee_loans(id) ON DELETE CASCADE,
      monto           NUMERIC(12,2) NOT NULL,
      fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
      periodo_nomina  VARCHAR(40),
      notes           TEXT,
      created_by      INTEGER,
      created_at      TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_loan_payments_loan ON loan_payments(loan_id);`);

  // Solicitudes / registros de vacaciones tomadas
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_vacation_requests (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      start_date      DATE NOT NULL,
      end_date        DATE NOT NULL,
      days            INTEGER NOT NULL,
      status          VARCHAR(20) NOT NULL DEFAULT 'aprobada',
      reason          TEXT,
      notes           TEXT,
      created_by      INTEGER,
      created_at      TIMESTAMP DEFAULT NOW(),
      cancelled_at    TIMESTAMP
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_vac_req_user ON employee_vacation_requests(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_vac_req_dates ON employee_vacation_requests(start_date, end_date);`);

  // Reservaciones de la quinta (prestación: 1 vez al año, solo paga mantenimiento)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_quinta_bookings (
      id                SERIAL PRIMARY KEY,
      user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      year              INTEGER NOT NULL,
      start_date        DATE NOT NULL,
      end_date          DATE NOT NULL,
      status            VARCHAR(20) NOT NULL DEFAULT 'reservada',
      maintenance_fee   NUMERIC(12,2) DEFAULT 0,
      maintenance_paid  BOOLEAN DEFAULT FALSE,
      notes             TEXT,
      created_by        INTEGER,
      created_at        TIMESTAMP DEFAULT NOW(),
      cancelled_at      TIMESTAMP
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_quinta_user_year ON employee_quinta_bookings(user_id, year);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_quinta_dates ON employee_quinta_bookings(start_date, end_date);`);

  migrated = true;
};

// ============================================
// Helpers
// ============================================
const calcAntiguedad = (hireDateStr: string | null | undefined) => {
  if (!hireDateStr) return null;
  const hire = new Date(hireDateStr);
  if (isNaN(hire.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - hire.getFullYear();
  let months = now.getMonth() - hire.getMonth();
  let days = now.getDate() - hire.getDate();
  if (days < 0) { months -= 1; days += 30; }
  if (months < 0) { years -= 1; months += 12; }
  const totalDays = Math.floor((now.getTime() - hire.getTime()) / (1000 * 60 * 60 * 24));
  return { years, months, days, totalDays, hireDate: hire.toISOString() };
};

// Vacaciones según Art. 76 LFT (reforma "Vacaciones Dignas" 2023)
//  1 año → 12 días, 2 años → 14, 3 años → 16, 4 años → 18, 5 años → 20,
//  6-10 → 22, 11-15 → 24, 16-20 → 26, 21-25 → 28, 26-30 → 30, 31+ → 32
const vacationDaysByYears = (years: number) => {
  if (years < 1) return 0;
  if (years === 1) return 12;
  if (years === 2) return 14;
  if (years === 3) return 16;
  if (years === 4) return 18;
  if (years === 5) return 20;
  if (years <= 10) return 22;
  if (years <= 15) return 24;
  if (years <= 20) return 26;
  if (years <= 25) return 28;
  if (years <= 30) return 30;
  return 32;
};

// LFT Art. 110: El descuento por préstamos NO puede exceder el 30%
// del EXCEDENTE del salario mínimo. Cálculo por período de nómina.
const calcMaxDescuentoLFT = (salarioBrutoPorPeriodo: number, salarioMinimoDiario: number, diasPorPeriodo = 15) => {
  const salarioMinimoPeriodo = salarioMinimoDiario * diasPorPeriodo;
  const excedente = Math.max(0, salarioBrutoPorPeriodo - salarioMinimoPeriodo);
  return Number((excedente * 0.30).toFixed(2));
};

const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN', maximumFractionDigits: 2,
}).format(Number(n || 0));

const numeroALetras = (n: number): string => {
  // Versión simple para Pagaré (decimales como "/100 M.N.")
  const entero = Math.floor(n);
  const cents = Math.round((n - entero) * 100);
  const unidades = ['','UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE','DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISÉIS','DIECISIETE','DIECIOCHO','DIECINUEVE','VEINTE'];
  const decenas: Record<number,string> = {2:'VEINTI',3:'TREINTA',4:'CUARENTA',5:'CINCUENTA',6:'SESENTA',7:'SETENTA',8:'OCHENTA',9:'NOVENTA'};
  const centenas: Record<number,string> = {1:'CIENTO',2:'DOSCIENTOS',3:'TRESCIENTOS',4:'CUATROCIENTOS',5:'QUINIENTOS',6:'SEISCIENTOS',7:'SETECIENTOS',8:'OCHOCIENTOS',9:'NOVECIENTOS'};
  const sub1000 = (x: number): string => {
    if (x === 0) return '';
    if (x === 100) return 'CIEN';
    if (x <= 20) return unidades[x] || '';
    if (x < 100) {
      const d = Math.floor(x/10), u = x % 10;
      if (d === 2 && u > 0) return 'VEINTI' + (unidades[u] || '').toLowerCase().toUpperCase();
      return (decenas[d] || '') + (u ? ' Y ' + (unidades[u] || '') : '');
    }
    const c = Math.floor(x/100), r = x % 100;
    return centenas[c] + (r ? ' ' + sub1000(r) : '');
  };
  const toWords = (x: number): string => {
    if (x === 0) return 'CERO';
    if (x < 1000) return sub1000(x);
    if (x < 1000000) {
      const miles = Math.floor(x/1000), resto = x % 1000;
      const milesStr = miles === 1 ? 'MIL' : sub1000(miles) + ' MIL';
      return milesStr + (resto ? ' ' + sub1000(resto) : '');
    }
    const mill = Math.floor(x/1000000), resto = x % 1000000;
    return sub1000(mill) + (mill === 1 ? ' MILLÓN' : ' MILLONES') + (resto ? ' ' + toWords(resto) : '');
  };
  return `${toWords(entero)} PESOS ${cents.toString().padStart(2,'0')}/100 M.N.`;
};

// ============================================
// GET /api/admin/hr/employees/:id/full-profile
// ============================================
export const getEmployeeFullProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureHRTables();
    const userId = parseInt(String(req.params.id || ''), 10);
    if (!userId) { res.status(400).json({ success: false, error: 'ID inválido' }); return; }

    const userQ = await pool.query(
      `SELECT id, full_name, email, phone, role, box_id, branch_id,
              employee_number, hire_date, profile_photo_url,
              ine_front_url, ine_back_url, selfie_url, signature_url,
              driver_license_front_url, driver_license_back_url, driver_license_expiry,
              rfc_url, curp_url, comprobante_domicilio_url, contract_pdf_url,
              pants_size, shirt_size, emergency_contact,
              marital_status, spouse_name, children_count, address,
              is_employee_onboarded, privacy_accepted_at, privacy_accepted_ip,
              privacy_signature_url,
              is_blocked, block_reason, blocked_at,
              COALESCE(is_active, TRUE) AS is_active, deleted_at
         FROM users WHERE id = $1`,
      [userId]
    );
    if (userQ.rowCount === 0) { res.status(404).json({ success: false, error: 'Empleado no encontrado' }); return; }
    const user = userQ.rows[0];
    const ADVISOR_ROLES_SET = new Set(['advisor', 'asesor', 'asesor_lider', 'sub_advisor']);
    user.is_advisor = ADVISOR_ROLES_SET.has(String(user.role || '').toLowerCase());
    user.has_privacy_signature = !!user.privacy_signature_url;

    const docsQ = await pool.query(
      `SELECT id, doc_type, filename, url, storage_key, mime_type, size_bytes, expires_at, notes, uploaded_at
         FROM employee_documents WHERE user_id = $1
         ORDER BY uploaded_at DESC`,
      [userId]
    );

    // El bucket S3 es privado: regenerar URL firmada (1h) para cada documento
    // que tenga storage_key. Esto evita el AccessDenied al abrir el archivo.
    const s3On = isS3Configured();
    const documentsWithUrls = await Promise.all(
      docsQ.rows.map(async (d: any) => {
        if (s3On && d.storage_key) {
          try {
            const signed = await getSignedUrlForKey(d.storage_key, 3600);
            return { ...d, url: signed };
          } catch (err) {
            console.error('[hr] signed url failed for', d.storage_key, err);
            return d;
          }
        }
        return d;
      })
    );

    const payrollQ = await pool.query(
      `SELECT * FROM employee_payroll_info WHERE user_id = $1`, [userId]
    );
    const payroll = payrollQ.rows[0] || null;

    const loansQ = await pool.query(
      `SELECT l.*,
              COALESCE((SELECT SUM(monto) FROM loan_payments WHERE loan_id = l.id), 0) AS pagado
         FROM employee_loans l
        WHERE l.user_id = $1
        ORDER BY l.created_at DESC`,
      [userId]
    );
    const loans = loansQ.rows.map(l => ({
      ...l,
      pagado: Number(l.pagado || 0),
      remanente: Number(l.monto_total) - Number(l.pagado || 0),
    }));

    const antiguedad = calcAntiguedad(user.hire_date);
    const vacationLegal = antiguedad ? vacationDaysByYears(antiguedad.years) : 0;

    // Documentos próximos a vencer (≤ 30 días)
    const today = new Date();
    const alerts: any[] = [];
    for (const d of docsQ.rows) {
      if (d.expires_at) {
        const diff = Math.ceil((new Date(d.expires_at).getTime() - today.getTime()) / (1000*60*60*24));
        if (diff <= 30) {
          alerts.push({
            type: 'doc_expiring',
            doc_type: d.doc_type,
            label: DOC_LABELS[d.doc_type as EmployeeDocType] || d.doc_type,
            expires_at: d.expires_at,
            days_remaining: diff,
            severity: diff < 0 ? 'error' : diff <= 7 ? 'warning' : 'info',
          });
        }
      }
    }
    if (user.driver_license_expiry) {
      const diff = Math.ceil((new Date(user.driver_license_expiry).getTime() - today.getTime()) / (1000*60*60*24));
      if (diff <= 30) {
        alerts.push({
          type: 'license_expiring',
          label: 'Licencia de Conducir',
          expires_at: user.driver_license_expiry,
          days_remaining: diff,
          severity: diff < 0 ? 'error' : diff <= 7 ? 'warning' : 'info',
        });
      }
    }

    res.json({
      success: true,
      user,
      documents: documentsWithUrls,
      doc_labels: DOC_LABELS,
      doc_types: EMPLOYEE_DOC_TYPES,
      payroll,
      loans,
      antiguedad,
      vacation_legal: vacationLegal,
      alerts,
      salario_minimo_diario: SALARIO_MINIMO_DIARIO_MX_DEFAULT,
    });
  } catch (e: any) {
    console.error('getEmployeeFullProfile error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Error interno' });
  }
};

// ============================================
// POST /api/admin/hr/employees/:id/documents (multipart)
// ============================================
export const uploadEmployeeDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureHRTables();
    const userId = parseInt(String(req.params.id || ''), 10);
    const docType = String(req.body?.doc_type || '').trim();
    const expiresAt = req.body?.expires_at || null;
    const notes = req.body?.notes || null;
    const uploadedBy = (req as any).user?.id;
    const file = (req as any).file as Express.Multer.File | undefined;

    if (!userId || !file) { res.status(400).json({ success: false, error: 'Faltan datos (user_id, archivo)' }); return; }
    if (!(EMPLOYEE_DOC_TYPES as readonly string[]).includes(docType)) {
      res.status(400).json({ success: false, error: 'doc_type inválido' }); return;
    }

    // S3 o local
    const ext = path.extname(file.originalname || '') || '';
    const safeName = `${docType}-${Date.now()}${ext}`;
    const storageKey = `hr/employees/${userId}/${safeName}`;
    let publicUrl = '';

    if (isS3Configured()) {
      publicUrl = await uploadToS3(file.buffer, storageKey, file.mimetype || 'application/octet-stream');
    } else {
      const localDir = path.join(process.cwd(), 'uploads', 'hr', 'employees', String(userId));
      if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
      const localPath = path.join(localDir, safeName);
      fs.writeFileSync(localPath, file.buffer);
      publicUrl = `/uploads/hr/employees/${userId}/${safeName}`;
    }

    const ins = await pool.query(
      `INSERT INTO employee_documents
        (user_id, doc_type, filename, url, storage_key, mime_type, size_bytes, expires_at, notes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [userId, docType, file.originalname || safeName, publicUrl, storageKey, file.mimetype, file.size,
       expiresAt || null, notes, uploadedBy || null]
    );

    // Mirror al perfil para compatibilidad con campos legacy en `users`
    const mirrorMap: Record<string, string> = {
      ine_front: 'ine_front_url',
      ine_back: 'ine_back_url',
      rfc: 'rfc_url',
      curp: 'curp_url',
      comprobante_domicilio: 'comprobante_domicilio_url',
      contract: 'contract_pdf_url',
    };
    if (mirrorMap[docType]) {
      await pool.query(`UPDATE users SET ${mirrorMap[docType]} = $1 WHERE id = $2`, [publicUrl, userId]);
    }

    res.json({ success: true, document: ins.rows[0] });
  } catch (e: any) {
    console.error('uploadEmployeeDocument error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Error interno' });
  }
};

// ============================================
// DELETE /api/admin/hr/documents/:docId
// ============================================
export const deleteEmployeeDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureHRTables();
    const docId = parseInt(String(req.params.docId || ''), 10);
    if (!docId) { res.status(400).json({ success: false, error: 'ID inválido' }); return; }
    const r = await pool.query(`DELETE FROM employee_documents WHERE id = $1 RETURNING id`, [docId]);
    if (r.rowCount === 0) { res.status(404).json({ success: false, error: 'No encontrado' }); return; }
    res.json({ success: true });
  } catch (e: any) {
    console.error('deleteEmployeeDocument error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Error interno' });
  }
};

// ============================================
// PUT /api/admin/hr/employees/:id/payroll
// ============================================
export const upsertPayroll = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureHRTables();
    const userId = parseInt(String(req.params.id || ''), 10);
    if (!userId) { res.status(400).json({ success: false, error: 'ID inválido' }); return; }

    const b = req.body || {};
    const updatedBy = (req as any).user?.id || null;

    await pool.query(
      `INSERT INTO employee_payroll_info
        (user_id, salario_bruto, salario_neto, sdi, nss, imss_status, imss_alta_date, imss_baja_date,
         vacation_days_available, vacation_days_taken, contract_type, contract_end_date,
         payment_period, bank_name, bank_clabe, bank_account, notes, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         salario_bruto = EXCLUDED.salario_bruto,
         salario_neto  = EXCLUDED.salario_neto,
         sdi           = EXCLUDED.sdi,
         nss           = EXCLUDED.nss,
         imss_status   = EXCLUDED.imss_status,
         imss_alta_date = EXCLUDED.imss_alta_date,
         imss_baja_date = EXCLUDED.imss_baja_date,
         vacation_days_available = EXCLUDED.vacation_days_available,
         vacation_days_taken     = EXCLUDED.vacation_days_taken,
         contract_type     = EXCLUDED.contract_type,
         contract_end_date = EXCLUDED.contract_end_date,
         payment_period    = EXCLUDED.payment_period,
         bank_name         = EXCLUDED.bank_name,
         bank_clabe        = EXCLUDED.bank_clabe,
         bank_account      = EXCLUDED.bank_account,
         notes             = EXCLUDED.notes,
         updated_by        = EXCLUDED.updated_by,
         updated_at        = NOW()`,
      [
        userId,
        Number(b.salario_bruto || 0),
        Number(b.salario_neto || 0),
        Number(b.sdi || 0),
        b.nss || null,
        b.imss_status || 'pendiente',
        b.imss_alta_date || null,
        b.imss_baja_date || null,
        Number(b.vacation_days_available || 0),
        Number(b.vacation_days_taken || 0),
        b.contract_type || 'indeterminado',
        b.contract_end_date || null,
        b.payment_period || 'quincenal',
        b.bank_name || null,
        b.bank_clabe || null,
        b.bank_account || null,
        b.notes || null,
        updatedBy,
      ]
    );

    const out = await pool.query(`SELECT * FROM employee_payroll_info WHERE user_id = $1`, [userId]);
    res.json({ success: true, payroll: out.rows[0] });
  } catch (e: any) {
    console.error('upsertPayroll error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Error interno' });
  }
};

// ============================================
// POST /api/admin/hr/employees/:id/loans
// Crea préstamo con validación LFT Art. 110.
// ============================================
export const createLoan = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureHRTables();
    const userId = parseInt(String(req.params.id || ''), 10);
    if (!userId) { res.status(400).json({ success: false, error: 'ID inválido' }); return; }

    const monto = Number(req.body?.monto_total || 0);
    const parcialidades = Number(req.body?.parcialidades || 0);
    const motivo = req.body?.motivo || '';
    const periodo = req.body?.periodo || 'quincenal';
    const fechaInicio = req.body?.fecha_inicio_descuentos || null;
    const createdBy = (req as any).user?.id || null;
    const overrideLft = !!req.body?.override_lft;

    if (monto <= 0 || parcialidades <= 0) {
      res.status(400).json({ success: false, error: 'Monto y parcialidades requeridos' }); return;
    }
    const montoPorParc = Number((monto / parcialidades).toFixed(2));

    // Validación LFT 30%
    const payrollQ = await pool.query(`SELECT * FROM employee_payroll_info WHERE user_id = $1`, [userId]);
    const payroll = payrollQ.rows[0];
    if (!payroll || !payroll.salario_bruto || Number(payroll.salario_bruto) <= 0) {
      res.status(400).json({
        success: false,
        error: 'Configura el salario bruto del empleado en "Nómina y Seguro" antes de crear préstamos.',
      });
      return;
    }
    const salarioBruto = Number(payroll.salario_bruto);
    const diasPorPeriodo = periodo === 'semanal' ? 7 : periodo === 'mensual' ? 30 : 15;
    // Asumimos salario_bruto está expresado por periodo de nómina configurado
    const maxDesc = calcMaxDescuentoLFT(salarioBruto, SALARIO_MINIMO_DIARIO_MX_DEFAULT, diasPorPeriodo);

    if (montoPorParc > maxDesc && !overrideLft) {
      res.status(422).json({
        success: false,
        error: 'Descuento por parcialidad excede el límite LFT Art. 110 (30% del excedente sobre el salario mínimo).',
        details: {
          monto_por_parcialidad: montoPorParc,
          max_descuento_permitido: maxDesc,
          salario_bruto_periodo: salarioBruto,
          salario_minimo_diario: SALARIO_MINIMO_DIARIO_MX_DEFAULT,
          dias_periodo: diasPorPeriodo,
          suggestion_parcialidades_min: Math.ceil(monto / maxDesc),
        },
      });
      return;
    }

    const insQ = await pool.query(
      `INSERT INTO employee_loans
        (user_id, monto_total, motivo, parcialidades, monto_por_parcialidad, periodo,
         fecha_inicio_descuentos, status, lft_max_descuento, salario_bruto_snapshot,
         salario_minimo_snapshot, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,$9,$10,$11)
       RETURNING *`,
      [userId, monto, motivo, parcialidades, montoPorParc, periodo, fechaInicio,
       maxDesc, salarioBruto, SALARIO_MINIMO_DIARIO_MX_DEFAULT, createdBy]
    );
    const loan = insQ.rows[0];

    res.json({
      success: true,
      loan,
      lft: { max_descuento: maxDesc, override_used: overrideLft },
    });
  } catch (e: any) {
    console.error('createLoan error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Error interno' });
  }
};

// ============================================
// POST /api/admin/hr/loans/:loanId/payments
// ============================================
export const addLoanPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureHRTables();
    const loanId = parseInt(String(req.params.loanId || ''), 10);
    const monto = Number(req.body?.monto || 0);
    const periodo = req.body?.periodo_nomina || null;
    const notes = req.body?.notes || null;
    const fecha = req.body?.fecha || null;
    const createdBy = (req as any).user?.id || null;

    if (!loanId || monto <= 0) {
      res.status(400).json({ success: false, error: 'Datos inválidos' }); return;
    }
    const loanQ = await pool.query(`SELECT * FROM employee_loans WHERE id = $1`, [loanId]);
    if (loanQ.rowCount === 0) { res.status(404).json({ success: false, error: 'Préstamo no encontrado' }); return; }
    const loan = loanQ.rows[0];

    await pool.query(
      `INSERT INTO loan_payments (loan_id, monto, fecha, periodo_nomina, notes, created_by)
       VALUES ($1,$2,COALESCE($3, CURRENT_DATE),$4,$5,$6)`,
      [loanId, monto, fecha, periodo, notes, createdBy]
    );

    const sumQ = await pool.query(
      `SELECT COALESCE(SUM(monto),0) AS pagado FROM loan_payments WHERE loan_id = $1`, [loanId]
    );
    const pagado = Number(sumQ.rows[0].pagado);
    if (pagado >= Number(loan.monto_total)) {
      await pool.query(`UPDATE employee_loans SET status='paid', paid_off_at=NOW() WHERE id=$1`, [loanId]);
    }

    res.json({ success: true, pagado, remanente: Math.max(0, Number(loan.monto_total) - pagado) });
  } catch (e: any) {
    console.error('addLoanPayment error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Error interno' });
  }
};

// ============================================
// POST /api/admin/hr/loans/:loanId/cancel
// ============================================
export const cancelLoan = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureHRTables();
    const loanId = parseInt(String(req.params.loanId || ''), 10);
    if (!loanId) { res.status(400).json({ success: false, error: 'ID inválido' }); return; }
    await pool.query(
      `UPDATE employee_loans SET status='cancelled', cancelled_at=NOW() WHERE id=$1`,
      [loanId]
    );
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error interno' });
  }
};

// ============================================
// GET /api/admin/hr/loans/:loanId/pagare
// Devuelve HTML imprimible (el navegador genera el PDF con "Imprimir → Guardar como PDF").
// ============================================
export const getPagareInterno = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureHRTables();
    const loanId = parseInt(String(req.params.loanId || ''), 10);
    if (!loanId) { res.status(400).json({ success: false, error: 'ID inválido' }); return; }

    const q = await pool.query(
      `SELECT l.*, u.full_name, u.email, u.phone, u.address, u.employee_number
         FROM employee_loans l
         JOIN users u ON u.id = l.user_id
        WHERE l.id = $1`,
      [loanId]
    );
    if (q.rowCount === 0) { res.status(404).send('Préstamo no encontrado'); return; }
    const L = q.rows[0];

    const fecha = new Date();
    const fechaStr = fecha.toLocaleDateString('es-MX', { dateStyle: 'long' });
    const montoTotal = Number(L.monto_total);
    const montoParc  = Number(L.monto_por_parcialidad);
    const parcs      = Number(L.parcialidades);
    const periodo    = L.periodo || 'quincenal';
    const fechaIni   = L.fecha_inicio_descuentos
      ? new Date(L.fecha_inicio_descuentos).toLocaleDateString('es-MX', { dateStyle: 'long' })
      : 'la próxima fecha de pago de nómina';

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<title>Pagaré Interno #${L.id}</title>
<style>
  @page { size: Letter; margin: 22mm 24mm; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #111; font-size: 12pt; line-height: 1.55; }
  h1 { text-align: center; letter-spacing: 4px; font-size: 22pt; margin: 0 0 6px; }
  .meta { text-align: right; font-size: 10pt; color: #555; margin-bottom: 14px; }
  .box { border: 1.5px solid #111; padding: 14px 20px; border-radius: 6px; margin: 18px 0; }
  .row { display: flex; justify-content: space-between; gap: 16px; }
  .row > div { flex: 1; }
  .label { font-size: 9pt; text-transform: uppercase; color: #666; letter-spacing: 1px; }
  .value { font-weight: bold; font-size: 12pt; }
  .signature { margin-top: 60px; display: flex; justify-content: space-between; gap: 60px; }
  .sig-block { flex: 1; text-align: center; }
  .sig-line { border-top: 1px solid #111; margin: 60px 0 6px; }
  .small { font-size: 10pt; color: #444; }
  .stamp { display: inline-block; padding: 4px 10px; border: 2px solid #C1272D; color: #C1272D;
           font-weight: bold; letter-spacing: 2px; transform: rotate(-4deg); font-size: 10pt;
           border-radius: 4px; }
  .footer { margin-top: 30px; font-size: 9pt; color: #777; text-align: center; }
  @media print { .noprint { display: none; } }
</style></head>
<body>
  <div class="noprint" style="text-align:right;margin-bottom:8px;">
    <button onclick="window.print()" style="padding:8px 16px;background:#F05A28;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;">
      Imprimir / Guardar como PDF
    </button>
  </div>

  <div class="meta">Folio interno: <strong>PAG-${String(L.id).padStart(6,'0')}</strong> · Emitido: ${fechaStr}</div>
  <h1>PAGARÉ</h1>
  <div style="text-align:center;margin-bottom:18px;">
    <span class="stamp">DOCUMENTO INTERNO · NO NEGOCIABLE</span>
  </div>

  <p>Por este <strong>PAGARÉ</strong> me obligo incondicionalmente a pagar a la orden de
  <strong>Logística System Development S.A. de C.V.</strong> ("EntregaX") la cantidad de
  <strong>${fmtMXN(montoTotal)}</strong> (<strong>${numeroALetras(montoTotal)}</strong>),
  importe que reconozco haber recibido a entera satisfacción en concepto de préstamo personal.</p>

  <div class="box">
    <div class="row">
      <div><div class="label">Suscriptor</div><div class="value">${L.full_name}</div></div>
      <div><div class="label">No. Empleado</div><div class="value">${L.employee_number || '—'}</div></div>
    </div>
    <div class="row" style="margin-top:10px;">
      <div><div class="label">Teléfono</div><div class="value">${L.phone || '—'}</div></div>
      <div><div class="label">Correo</div><div class="value">${L.email || '—'}</div></div>
    </div>
    ${L.address ? `<div style="margin-top:10px;"><div class="label">Domicilio</div><div class="value">${L.address}</div></div>` : ''}
  </div>

  <div class="box">
    <div class="row">
      <div><div class="label">Monto Total</div><div class="value">${fmtMXN(montoTotal)}</div></div>
      <div><div class="label">Parcialidades</div><div class="value">${parcs} (${periodo})</div></div>
      <div><div class="label">Importe por parcialidad</div><div class="value">${fmtMXN(montoParc)}</div></div>
    </div>
    <div class="row" style="margin-top:10px;">
      <div><div class="label">Inicio de descuentos</div><div class="value">${fechaIni}</div></div>
      <div><div class="label">Motivo</div><div class="value">${L.motivo || '—'}</div></div>
    </div>
  </div>

  <p>El suscriptor autoriza expresamente a <strong>EntregaX</strong> a descontar de su salario,
  vía nómina, el importe por parcialidad arriba señalado, en términos del Artículo 110, fracción I,
  de la <em>Ley Federal del Trabajo</em>, manifestando bajo protesta de decir verdad que el descuento
  pactado no excede el 30% del excedente del salario mínimo.</p>

  <p>El presente pagaré se rige por la <em>Ley General de Títulos y Operaciones de Crédito</em>
  y, en caso de falta de pago, generará intereses moratorios al tipo legal. Para la interpretación
  y cumplimiento del presente, las partes se someten a la jurisdicción de los tribunales competentes
  en Monterrey, Nuevo León, renunciando a cualquier otro fuero.</p>

  <p class="small">Lugar de suscripción: <strong>Monterrey, Nuevo León</strong>.
  Fecha de suscripción: <strong>${fechaStr}</strong>.</p>

  <div class="signature">
    <div class="sig-block">
      <div class="sig-line"></div>
      <div><strong>${L.full_name}</strong></div>
      <div class="small">Suscriptor (firma autógrafa)</div>
    </div>
    <div class="sig-block">
      <div class="sig-line"></div>
      <div><strong>EntregaX — Recursos Humanos</strong></div>
      <div class="small">Por el Beneficiario</div>
    </div>
  </div>

  <div class="footer">
    Logística System Development S.A. de C.V. · Revolución Sur 3866 B8, Torremolinos, Monterrey, N.L., C.P. 64860
  </div>
</body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e: any) {
    console.error('getPagareInterno error:', e);
    res.status(500).send('Error generando pagaré: ' + (e?.message || 'desconocido'));
  }
};

// ============================================
// GET /api/admin/hr/dashboard-summary
// Totales para el dashboard de RH
// ============================================
export const getHRDashboardSummary = async (_req: Request, res: Response): Promise<void> => {
  try {
    await ensureHRTables();
    const totalNominaQ = await pool.query(
      `SELECT COALESCE(SUM(salario_bruto),0) AS total_bruto,
              COALESCE(SUM(salario_neto),0) AS total_neto,
              COUNT(*) AS empleados_con_nomina
         FROM employee_payroll_info`
    );
    const prestamosQ = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status='active') AS prestamos_activos,
         COALESCE(SUM(CASE WHEN status='active' THEN monto_total END),0) AS total_prestado_activo,
         COALESCE((SELECT SUM(monto) FROM loan_payments
                    WHERE loan_id IN (SELECT id FROM employee_loans WHERE status='active')),0) AS total_pagado_activo
         FROM employee_loans`
    );
    const totalPrestado = Number(prestamosQ.rows[0].total_prestado_activo);
    const totalPagado = Number(prestamosQ.rows[0].total_pagado_activo);
    res.json({
      success: true,
      nomina: {
        total_bruto: Number(totalNominaQ.rows[0].total_bruto),
        total_neto: Number(totalNominaQ.rows[0].total_neto),
        empleados: Number(totalNominaQ.rows[0].empleados_con_nomina),
      },
      prestamos: {
        activos: Number(prestamosQ.rows[0].prestamos_activos),
        total_prestado: totalPrestado,
        total_pagado: totalPagado,
        por_cobrar: Math.max(0, totalPrestado - totalPagado),
      },
    });
  } catch (e: any) {
    console.error('getHRDashboardSummary error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Error interno' });
  }
};

// ============================================
// VACACIONES
// ============================================

const diffDaysInclusive = (start: string, end: string): number => {
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  return Math.max(0, Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
};

// GET /api/admin/hr/employees/:id/vacations
export const listVacationRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureHRTables();
    const userId = parseInt(String(req.params.id || ''), 10);
    if (!userId) { res.status(400).json({ success: false, error: 'ID inválido' }); return; }

    const userQ = await pool.query(
      `SELECT id, full_name, hire_date FROM users WHERE id = $1`, [userId]
    );
    if (userQ.rowCount === 0) { res.status(404).json({ success: false, error: 'Empleado no encontrado' }); return; }
    const user = userQ.rows[0];

    const reqsQ = await pool.query(
      `SELECT id, user_id, start_date, end_date, days, status, reason, notes, created_at, cancelled_at
         FROM employee_vacation_requests
        WHERE user_id = $1
        ORDER BY start_date DESC`,
      [userId]
    );

    const payrollQ = await pool.query(
      `SELECT vacation_days_available, vacation_days_taken FROM employee_payroll_info WHERE user_id = $1`,
      [userId]
    );
    const payroll = payrollQ.rows[0] || { vacation_days_available: 0, vacation_days_taken: 0 };

    const antiguedad = calcAntiguedad(user.hire_date);
    const vacationLegal = antiguedad ? vacationDaysByYears(antiguedad.years) : 0;

    // Días tomados (sumando los aprobados no cancelados)
    const takenSumQ = await pool.query(
      `SELECT COALESCE(SUM(days),0) AS total
         FROM employee_vacation_requests
        WHERE user_id = $1 AND status = 'aprobada' AND cancelled_at IS NULL`,
      [userId]
    );
    const totalTaken = Number(takenSumQ.rows[0].total || 0);

    res.json({
      success: true,
      user,
      requests: reqsQ.rows,
      summary: {
        vacation_legal: vacationLegal,
        days_available_setting: Number(payroll.vacation_days_available || vacationLegal || 0),
        days_taken_total: totalTaken,
        days_remaining: Math.max(0, Number(payroll.vacation_days_available || vacationLegal || 0) - totalTaken),
        antiguedad,
      },
    });
  } catch (e: any) {
    console.error('listVacationRequests error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Error interno' });
  }
};

// POST /api/admin/hr/employees/:id/vacations
export const createVacationRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureHRTables();
    const userId = parseInt(String(req.params.id || ''), 10);
    const { start_date, end_date, reason, notes, status } = req.body || {};
    const createdBy = (req as any).user?.id;

    if (!userId || !start_date || !end_date) {
      res.status(400).json({ success: false, error: 'Faltan datos (start_date, end_date)' });
      return;
    }
    const days = diffDaysInclusive(String(start_date), String(end_date));
    if (days <= 0) {
      res.status(400).json({ success: false, error: 'Rango de fechas inválido' });
      return;
    }

    const ins = await pool.query(
      `INSERT INTO employee_vacation_requests
        (user_id, start_date, end_date, days, status, reason, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [userId, start_date, end_date, days, status || 'aprobada', reason || null, notes || null, createdBy || null]
    );

    // Reflejar el contador en employee_payroll_info (si existe)
    await pool.query(
      `INSERT INTO employee_payroll_info (user_id, vacation_days_taken)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET
         vacation_days_taken = COALESCE(employee_payroll_info.vacation_days_taken, 0) + $2,
         updated_at = NOW()`,
      [userId, days]
    );

    res.json({ success: true, request: ins.rows[0] });
  } catch (e: any) {
    console.error('createVacationRequest error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Error interno' });
  }
};

// DELETE /api/admin/hr/vacations/:requestId  (cancela)
export const cancelVacationRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureHRTables();
    const reqId = parseInt(String(req.params.requestId || ''), 10);
    if (!reqId) { res.status(400).json({ success: false, error: 'ID inválido' }); return; }

    const cur = await pool.query(
      `SELECT id, user_id, days, status, cancelled_at FROM employee_vacation_requests WHERE id = $1`,
      [reqId]
    );
    if (cur.rowCount === 0) { res.status(404).json({ success: false, error: 'No encontrado' }); return; }
    const row = cur.rows[0];
    if (row.cancelled_at) {
      res.status(400).json({ success: false, error: 'Ya estaba cancelada' });
      return;
    }

    await pool.query(
      `UPDATE employee_vacation_requests SET cancelled_at = NOW(), status = 'cancelada' WHERE id = $1`,
      [reqId]
    );

    // Reembolsar días al contador
    if (row.status === 'aprobada') {
      await pool.query(
        `UPDATE employee_payroll_info
            SET vacation_days_taken = GREATEST(0, COALESCE(vacation_days_taken,0) - $1),
                updated_at = NOW()
          WHERE user_id = $2`,
        [Number(row.days || 0), row.user_id]
      );
    }

    res.json({ success: true });
  } catch (e: any) {
    console.error('cancelVacationRequest error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Error interno' });
  }
};

// ============================================
// QUINTA — Prestación 1 vez al año por empleado
// ============================================

// GET /api/admin/hr/employees/:id/quinta?year=2026
export const listQuintaBookings = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureHRTables();
    const userId = parseInt(String(req.params.id || ''), 10);
    const year = parseInt(String(req.query.year || new Date().getFullYear()), 10);
    if (!userId) { res.status(400).json({ success: false, error: 'ID inválido' }); return; }

    const all = await pool.query(
      `SELECT id, user_id, year, start_date, end_date, status, maintenance_fee, maintenance_paid,
              notes, created_at, cancelled_at
         FROM employee_quinta_bookings
        WHERE user_id = $1
        ORDER BY year DESC, start_date DESC`,
      [userId]
    );

    const usedThisYear = all.rows.some(b => b.year === year && !b.cancelled_at);

    res.json({
      success: true,
      year,
      used_this_year: usedThisYear,
      available_this_year: !usedThisYear,
      bookings: all.rows,
    });
  } catch (e: any) {
    console.error('listQuintaBookings error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Error interno' });
  }
};

// POST /api/admin/hr/employees/:id/quinta
export const createQuintaBooking = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureHRTables();
    const userId = parseInt(String(req.params.id || ''), 10);
    const { start_date, end_date, maintenance_fee, maintenance_paid, notes, force } = req.body || {};
    const createdBy = (req as any).user?.id;

    if (!userId || !start_date || !end_date) {
      res.status(400).json({ success: false, error: 'Faltan datos (start_date, end_date)' });
      return;
    }
    const start = new Date(start_date);
    const end = new Date(end_date);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
      res.status(400).json({ success: false, error: 'Rango de fechas inválido' });
      return;
    }
    const year = start.getFullYear();

    // Validar 1-vez-al-año (salvo `force=true` para casos excepcionales del admin)
    if (!force) {
      const exists = await pool.query(
        `SELECT id FROM employee_quinta_bookings
          WHERE user_id = $1 AND year = $2 AND cancelled_at IS NULL`,
        [userId, year]
      );
      if ((exists.rowCount ?? 0) > 0) {
        res.status(409).json({
          success: false,
          error: `El empleado ya usó su prestación de quinta en ${year}. Cancela la reservación previa o usa force=true.`,
        });
        return;
      }
    }

    // Conflicto de fechas con otra reservación activa (de cualquier empleado)
    const conflict = await pool.query(
      `SELECT q.id, q.user_id, u.full_name, q.start_date, q.end_date
         FROM employee_quinta_bookings q
         JOIN users u ON u.id = q.user_id
        WHERE q.cancelled_at IS NULL
          AND NOT (q.end_date < $1 OR q.start_date > $2)`,
      [start_date, end_date]
    );
    if ((conflict.rowCount ?? 0) > 0 && !force) {
      res.status(409).json({
        success: false,
        error: 'Conflicto: la quinta ya está reservada en esas fechas.',
        conflicts: conflict.rows,
      });
      return;
    }

    const ins = await pool.query(
      `INSERT INTO employee_quinta_bookings
        (user_id, year, start_date, end_date, maintenance_fee, maintenance_paid, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [userId, year, start_date, end_date, Number(maintenance_fee || 0), !!maintenance_paid,
       notes || null, createdBy || null]
    );

    res.json({ success: true, booking: ins.rows[0] });
  } catch (e: any) {
    console.error('createQuintaBooking error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Error interno' });
  }
};

// DELETE /api/admin/hr/quinta/:bookingId  (cancela)
export const cancelQuintaBooking = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureHRTables();
    const bookingId = parseInt(String(req.params.bookingId || ''), 10);
    if (!bookingId) { res.status(400).json({ success: false, error: 'ID inválido' }); return; }

    const cur = await pool.query(
      `SELECT id, cancelled_at FROM employee_quinta_bookings WHERE id = $1`, [bookingId]
    );
    if (cur.rowCount === 0) { res.status(404).json({ success: false, error: 'No encontrada' }); return; }
    if (cur.rows[0].cancelled_at) {
      res.status(400).json({ success: false, error: 'Ya estaba cancelada' });
      return;
    }

    await pool.query(
      `UPDATE employee_quinta_bookings SET cancelled_at = NOW(), status = 'cancelada' WHERE id = $1`,
      [bookingId]
    );

    res.json({ success: true });
  } catch (e: any) {
    console.error('cancelQuintaBooking error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Error interno' });
  }
};

// PATCH /api/admin/hr/quinta/:bookingId/payment  (marcar pago de mantenimiento)
export const updateQuintaPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureHRTables();
    const bookingId = parseInt(String(req.params.bookingId || ''), 10);
    const { maintenance_fee, maintenance_paid } = req.body || {};
    if (!bookingId) { res.status(400).json({ success: false, error: 'ID inválido' }); return; }

    const upd = await pool.query(
      `UPDATE employee_quinta_bookings
          SET maintenance_fee = COALESCE($1, maintenance_fee),
              maintenance_paid = COALESCE($2, maintenance_paid)
        WHERE id = $3
        RETURNING *`,
      [
        maintenance_fee !== undefined ? Number(maintenance_fee) : null,
        maintenance_paid !== undefined ? !!maintenance_paid : null,
        bookingId,
      ]
    );
    if (upd.rowCount === 0) { res.status(404).json({ success: false, error: 'No encontrada' }); return; }

    res.json({ success: true, booking: upd.rows[0] });
  } catch (e: any) {
    console.error('updateQuintaPayment error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Error interno' });
  }
};

// GET /api/admin/hr/quinta/calendar?year=2026
export const getQuintaCalendar = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureHRTables();
    const year = parseInt(String(req.query.year || new Date().getFullYear()), 10);

    const rows = await pool.query(
      `SELECT q.id, q.user_id, u.full_name, u.role, q.year, q.start_date, q.end_date,
              q.status, q.maintenance_fee, q.maintenance_paid, q.notes
         FROM employee_quinta_bookings q
         JOIN users u ON u.id = q.user_id
        WHERE q.year = $1 AND q.cancelled_at IS NULL
        ORDER BY q.start_date ASC`,
      [year]
    );

    res.json({ success: true, year, bookings: rows.rows });
  } catch (e: any) {
    console.error('getQuintaCalendar error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Error interno' });
  }
};

// ============================================
// POST /api/admin/hr/employees/:id/generate-advisor-contract
// Genera un PDF de contrato + aviso de privacidad firmado por el asesor
// (usando la firma digital almacenada en users.privacy_signature_url al
//  momento de aceptar el aviso), lo sube a S3 y lo registra como
// employee_documents.doc_type = 'contract'.
// ============================================
const ADVISOR_ROLES = new Set(['advisor', 'asesor', 'asesor_lider', 'sub_advisor']);

export const generateAdvisorContract = async (req: Request, res: Response): Promise<void> => {
  let browser: any = null;
  try {
    await ensureHRTables();
    const userId = parseInt(String(req.params.id || ''), 10);
    if (!userId) { res.status(400).json({ success: false, error: 'ID inválido' }); return; }
    const generatedBy = (req as any).user?.id;

    const userQ = await pool.query(
      `SELECT id, full_name, email, phone, role, employee_number,
              privacy_signature_url, privacy_accepted_at, privacy_accepted_ip,
              created_at
         FROM users WHERE id = $1`,
      [userId]
    );
    if (userQ.rowCount === 0) { res.status(404).json({ success: false, error: 'Asesor no encontrado' }); return; }
    const user = userQ.rows[0];
    if (!ADVISOR_ROLES.has(String(user.role || '').toLowerCase())) {
      res.status(400).json({ success: false, error: 'Este endpoint es solo para asesores' });
      return;
    }
    if (!user.privacy_signature_url) {
      res.status(400).json({
        success: false,
        error: 'El asesor aún no ha firmado digitalmente el aviso de privacidad. No es posible generar el contrato.',
      });
      return;
    }

    const fmtDate = (d?: Date | string | null) => {
      if (!d) return '—';
      const dt = typeof d === 'string' ? new Date(d) : d;
      return dt.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
    };
    const acceptedAt = user.privacy_accepted_at ? new Date(user.privacy_accepted_at) : new Date();

    // Cargar el contenido EDITABLE del aviso/contrato de asesores
    // (mismo texto que el asesor leyó y aceptó en la app móvil)
    const legal: any = await getEditableLegalDoc('advisor_privacy_notice', ADVISOR_FALLBACK as any);
    const escapeHtml = (s: string) => String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const renderParagraphs = (text: string) => escapeHtml(text)
      .split(/\n{2,}/)
      .map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
      .join('');

    let sectionsHtml = '';
    if (Array.isArray(legal?.sections) && legal.sections.length > 0) {
      sectionsHtml = legal.sections.map((s: any) => `
        ${s.title ? `<h2>${escapeHtml(s.title)}</h2>` : ''}
        ${renderParagraphs(s.content || '')}
      `).join('');
    } else if (legal?.content) {
      sectionsHtml = renderParagraphs(legal.content);
    }

    const legalTitle = escapeHtml(legal?.title || ADVISOR_FALLBACK.title);
    const legalCompany = escapeHtml(legal?.company || ADVISOR_FALLBACK.company);
    const legalAddress = escapeHtml(legal?.address || ADVISOR_FALLBACK.address);
    const legalVersion = legal?.version ? `v${escapeHtml(String(legal.version))}` : '';
    const legalUpdated = escapeHtml(legal?.lastUpdate || '');

    // HTML del contrato: contiene el TEXTO REAL aceptado por el asesor +
    // datos del asesor + firma autógrafa digital + huella de auditoría.
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${legalTitle}</title>
<style>
  @page { size: Letter; margin: 18mm 16mm; }
  body { font-family: Arial, sans-serif; color: #1f2937; font-size: 10.5pt; line-height: 1.55; }
  h1 { color: #F05A28; font-size: 16pt; margin: 0 0 4pt 0; }
  h2 { color: #111827; font-size: 11.5pt; border-bottom: 1.2pt solid #F05A28; padding-bottom: 3pt; margin: 16pt 0 6pt 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2pt solid #F05A28; padding-bottom: 10pt; margin-bottom: 12pt; }
  .meta { font-size: 9pt; color: #6b7280; text-align: right; }
  .data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4pt 16pt; margin: 6pt 0 4pt 0; font-size: 10pt; }
  .data-grid div b { color: #374151; }
  p { text-align: justify; margin: 5pt 0; }
  .signature-box { border: 1pt dashed #9ca3af; padding: 10pt; margin-top: 18pt; border-radius: 4pt; background: #fafafa; page-break-inside: avoid; }
  .signature-img { display: block; max-height: 130px; max-width: 340px; margin: 6pt auto; }
  .footer { margin-top: 18pt; font-size: 8pt; color: #6b7280; text-align: center; border-top: 1pt solid #e5e7eb; padding-top: 6pt; }
  .audit { font-family: monospace; font-size: 8pt; color: #6b7280; }
  .legal-meta { font-size: 9pt; color: #6b7280; margin-bottom: 8pt; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${legalTitle}</h1>
      <div style="font-size: 10pt; color: #6b7280;">${legalCompany}</div>
      <div style="font-size: 9pt; color: #9ca3af;">${legalAddress}</div>
    </div>
    <div class="meta">
      Documento No. ${user.id}-${Date.now()}<br/>
      Emitido: ${fmtDate(new Date())}<br/>
      ${legalVersion ? `Versión: ${legalVersion}<br/>` : ''}
      ${legalUpdated ? `Actualizado: ${legalUpdated}` : ''}
    </div>
  </div>

  <h2>Datos del Asesor</h2>
  <div class="data-grid">
    <div><b>Nombre:</b> ${escapeHtml(user.full_name || '—')}</div>
    <div><b>No. Asesor:</b> ${escapeHtml(user.employee_number || String(user.id))}</div>
    <div><b>Email:</b> ${escapeHtml(user.email || '—')}</div>
    <div><b>Teléfono:</b> ${escapeHtml(user.phone || '—')}</div>
    <div><b>Rol:</b> ${escapeHtml(user.role || '—')}</div>
    <div><b>Alta en sistema:</b> ${fmtDate(user.created_at)}</div>
  </div>

  ${sectionsHtml}

  <div class="signature-box">
    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
      <div>
        <div style="font-weight: 700; color: #111827; font-size: 11pt;">Firma autógrafa digital del Asesor</div>
        <div style="font-size: 10pt; color: #374151; margin-top: 2pt;">${escapeHtml(user.full_name || '')}</div>
        <div style="font-size: 8.5pt; color: #6b7280; margin-top: 2pt;">
          Aceptación electrónica conforme al Art. 89 del Código de Comercio y NOM-151-SCFI-2016
        </div>
      </div>
      <div class="audit" style="text-align: right;">
        Aceptado: ${fmtDate(acceptedAt)}<br/>
        Hora: ${acceptedAt.toLocaleTimeString('es-MX')}<br/>
        IP: ${escapeHtml(user.privacy_accepted_ip || 'no registrada')}
      </div>
    </div>
    <img src="${user.privacy_signature_url}" alt="Firma digital" class="signature-img" />
    <div style="border-top: 1pt solid #1f2937; margin: 4pt 80pt 0; text-align: center; padding-top: 3pt; font-size: 9pt; color: #6b7280;">
      Firma del Asesor
    </div>
  </div>

  <div class="footer">
    ${legalCompany} · ${legalAddress}<br/>
    Documento generado automáticamente · ID auditoría: U${user.id}-${acceptedAt.getTime()}
  </div>
</body>
</html>`;

    // Generar PDF con puppeteer
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const puppeteer = require('puppeteer');
    const isProduction = process.env.NODE_ENV === 'production';
    const launchOptions: any = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    };
    if (isProduction) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable';
    } else {
      launchOptions.executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    }

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer: Buffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '18mm', right: '16mm', bottom: '18mm', left: '16mm' },
    });
    await browser.close();
    browser = null;

    // Subir a S3 (o local)
    const filename = `contrato-asesor-${userId}-${Date.now()}.pdf`;
    const storageKey = `hr/employees/${userId}/${filename}`;
    let publicUrl = '';
    if (isS3Configured()) {
      publicUrl = await uploadToS3(pdfBuffer, storageKey, 'application/pdf');
    } else {
      const localDir = path.join(process.cwd(), 'uploads', 'hr', 'employees', String(userId));
      if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
      fs.writeFileSync(path.join(localDir, filename), pdfBuffer);
      publicUrl = `/uploads/hr/employees/${userId}/${filename}`;
    }

    // Registrar en employee_documents (reemplaza cualquier contract previo manteniendo histórico)
    const ins = await pool.query(
      `INSERT INTO employee_documents
        (user_id, doc_type, filename, url, storage_key, mime_type, size_bytes, notes, uploaded_by)
       VALUES ($1, 'contract', $2, $3, $4, 'application/pdf', $5, $6, $7)
       RETURNING *`,
      [userId, filename, publicUrl, storageKey, pdfBuffer.length,
       'Generado automáticamente con firma digital del aviso de privacidad', generatedBy || null]
    );

    // Mirror al campo legacy
    await pool.query(`UPDATE users SET contract_pdf_url = $1 WHERE id = $2`, [publicUrl, userId]);

    res.json({ success: true, document: ins.rows[0] });
  } catch (e: any) {
    if (browser) { try { await browser.close(); } catch {} }
    console.error('generateAdvisorContract error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Error generando contrato' });
  }
};
