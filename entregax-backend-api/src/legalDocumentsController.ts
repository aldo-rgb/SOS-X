import { Request, Response } from 'express';
import { pool } from './db';

const REQUIRED_DOCUMENTS: Array<{ document_type: string; title: string; content: string }> = [
  {
    document_type: 'privacy_policy',
    title: 'POLÍTICA DE PRIVACIDAD DE ENTREGAX',
    content:
      '1. RESPONSABLE DEL TRATAMIENTO\n\n' +
      'Logística System Development S.A. de C.V. (EntregaX) es responsable del uso y protección de los datos personales.\n\n' +
      '2. DATOS RECABADOS\n\n' +
      'Podemos recabar datos de identificación, contacto, ubicación, información operativa y datos necesarios para la prestación de servicios logísticos.\n\n' +
      '3. FINALIDADES\n\n' +
      'Usamos los datos para registro de usuarios, operación logística, seguimiento de envíos, soporte, cumplimiento legal y seguridad.\n\n' +
      '4. DERECHOS ARCO\n\n' +
      'Puedes ejercer tus derechos de acceso, rectificación, cancelación y oposición escribiendo a: contacto@entregax.com\n\n' +
      '5. ACTUALIZACIONES\n\n' +
      'Esta política puede actualizarse en cualquier momento. La versión vigente se publica en este módulo.'
  },
  {
    document_type: 'privacy_notice',
    title: 'AVISO DE PRIVACIDAD INTEGRAL DE ENTREGAX',
    content: 'Documento editable desde panel legal.'
  },
  {
    document_type: 'advisor_privacy_notice',
    title: 'AVISO DE PRIVACIDAD Y TÉRMINOS DE COMISIONES PARA ASESORES COMERCIALES',
    content: 'Documento editable desde panel legal.'
  },
  {
    document_type: 'service_contract',
    title: 'CONTRATO DE PRESTACIÓN DE SERVICIOS',
    content:
      'LOGISTI-K SYSTEMS DEVELOPMENT S.A. DE C.V. (en adelante como "LSD") y EL CLIENTE, acuerdan que la aceptación y ejecución del presente contrato (el "Contrato") en la que se incluye el presente clausulado constituye el consentimiento de EL CLIENTE para sujetarse a los siguientes términos y condiciones:\n\n' +
      'TÉRMINOS Y CONDICIONES:\n\n' +
      'OBJETO. El objeto de la relación comercial, así como su alcance, se limitan única y exclusivamente a lo detallado en (las) Cotización(es) que se anexen al presente Contrato de tiempo en tiempo, las cuales solo se emitirán por LSD a atendiendo las solicitudes de servicio de EL CLIENTE y no requerían firmas de las Partes dado que se entenderán por aceptadas automáticamente por ambas partes una vez que hayan transcurrido 48 horas después de su generación y no se reciban comentarios u objeciones por alguna de las Partes.\n\n' +
      'CONTRAPRESTACIÓN. La cantidad señalada como contraprestación en la Cotización aplicable será pagada en los términos y condiciones ahí descritos.\n\n' +
      'OBLIGACIONES DEL CLIENTE. Además de las obligaciones y compromisos que se especifiquen en cada una de las Cotizaciones que se emitan por LSD de tiempo en tiempo, EL CLIENTE se compromete en todo momento a proporcionar la información correcta de sus productos como lo es, de manera enunciativa más no limitativa: fotografías, manuales, listas de empaque, comprobantes de pago de adquisición de mercancías y/o cualquier otra que sé necesaria para que LSD pueda brindar el servicio contratado en la Cotización respectiva. Adicionalmente, EL CLIENTE acepta que en caso de que existan gastos generados por sus mercancías en el punto de origen, esos serán adicionados a la cotización.\n\n' +
      'CONFIDENCIALIDAD DE LA INFORMACIÓN. Las partes acuerdan el considerar como información confidencial cualquier información oral o escrita proporcionada por una a la otra con motivo de esta operación y/o del acuerdo de voluntades que paralelamente a este instrumento se llegue a firmar y que las partes identifiquen como "Confidencial". Se incluye toda la información escrita, oral, gráfica, visual o tangible por cualquiera de los sentidos del ser humano, o contenida en medios escritos, electrónicos o electromagnéticos, la que incluye de manera enunciativa más no limitativa, información técnica, financiera y comercial relativa a nombres de clientes o acreditados, información sensible o no en términos de la Ley Federal de Protección de Datos Personales en Posesión de Particulares (En lo sucesivo "LFPDP"). En virtud de lo anterior, las partes se obligan a adoptar las acciones y precauciones necesarias para preservar la confidencialidad de la información confidencial. Las partes acuerdan que ellas usarán la información confidencial solamente para la ejecución de la presente operación y se obligan a no revelar la información confidencial, ya sea total o parcialmente, y no usar la misma para propósitos distintos a los detallados anteriormente.\n\n' +
      'VIGENCIA. La relación de este Contrato es por tiempo indefinido y aplicará en todas y cada una de las Cotizaciones que se emitan por LSD y hayan sido aceptadas por EL CLIENTE de conformidad con la cláusula de objeto del presente Contrato.\n\n' +
      'POLÍTICA DE DEVOLUCIÓN. La garantía de devolución a favor de EL CLIENTE aplicará siempre y cuando sea informado a través de un correo institucional de LSD que su mercancía sí califica para dicho evento. El reembolso será de USD $7.00 (siete dólares estadounidenses) por kilo si el traslado es aéreo y/o terrestre. Si el traslado es marítimo se reembolsarán USD $800.00 (ochocientos dólares estadounidenses) por metro cúbico. Dichos reembolsos mencionados en el presente artículo, solo aplicarán en el evento de que EL CLIENTE no cuente con una garantía extendida directamente contratada con LSD previo al traslado de sus mercancías. En lo sucesivo; si EL CLIENTE realizó un pago con antelación de mercancía que aplicó para reembolso, se devolverá dicho pago más el reembolso correspondiente. Lo anterior, en el entendido que EL CLIENTE tendrá un plazo máximo de 90 (noventa) días naturales para hacer válido el reembolso aquí estipulado, los cuales empezaran a contar desde el día que haya recibido el correo electrónico de LSD.\n\n' +
      'CÁLCULOS DE COTIZACIÓN. El tipo de cambio de cotización se basará en el servicio aéreo, en el día que su mercancía toma vuelo en su punto de origen; y en servicio marítimo en el día de cierre y embarque de contenedor. Los precios están sujetos a cambios, ya que el flete fluctúa constantemente a base de demanda, temporada.\n\n' +
      'GASTOS DE ALMACENAMIENTO DE MERCANCÍAS A CARGO DE EL CLIENTE. Una vez que haya transcurrido el plazo de 15 (quince) días naturales después de la(s) mercancía(s) de EL CLIENTE hayan arribado a las instalaciones de LSD; y EL CLIENTE no haya liquidado cualquier adeudo (parcial o total) que tenga con LSD, en este acto acepta que en automático se le estarán realizando los cobros correspondientes de almacenaje y resguardo de sus mercancías según los aranceles y tarifas que LSD tenga vigente al momento de cobro de dichos conceptos; siendo esta tarifa la de MXN $1.00 (un peso MXN) por cada kilo que pese la(s) mercancía(s). Lo anterior en el entendido de que EL CLIENTE consciente y faculta a LSD para que pueda retener las mercancías hasta que EL CLIENTE no haya realizado el pago de estos conceptos.\n\n' +
      'RENUNCIA DE DERECHOS DE PROPIEDAD DE EL CLIENTE. Una vez que haya transcurrido el plazo de 60 (sesenta) días naturales después de la(s) mercancía(s) de EL CLIENTE se hayan cotizado por parte de LSD; y EL CLIENTE no ha liquidado cualquier adeudo (parcial o total) que tenga con LSD, en este acto acepta que, si EL CLIENTE no solicitó formalmente por escrito ante LSD una prórroga de otro plazo de 30 (treinta) días naturales, en automático estuviere renunciando a sus derechos de propiedad sobre dichas mercancías que fueron despachadas por LSD. Por consiguiente, después de la renuncia de derechos de parte de EL CLIENTE, este último cede a favor de LSD todos los derechos de propiedad de dichas mercancías, inclusive autorizándolo de forma irrevocable a que LSD pueda refacturar dichas mercancías ya como propiedad de LSD.\n\n' +
      'LÍMITE DE RESPONSABILIDAD Y GARANTÍA. LSD garantiza que la calidad de los servicios al amparo de las Cotizaciones cumplen con los estándares de mercado en México y con los requerimientos específicos realizados por EL CLIENTE, obligándose a resarcir los daños y perjuicios que puedan ser causados a EL CLIENTE por incumplimiento a cualquiera de sus obligaciones al amparo del presente Contrato y/o su respectiva Cotización. Lo anterior, en el entendido que el límite máximo de responsabilidad la cual estará expuesto LSD no podrá exceder del 50% (cincuenta por ciento) del valor total de la contraprestación (antes de impuestos) pactada en la Cotización respectiva que haya generado el incumplimiento y por consiguiente los daños y perjuicios a EL CLIENTE. No obstante lo anterior, es del entendido de las Partes que LSD no se hará responsable de ningún daño y perjuicio que haya sufrido EL CLIENTE a consecuencia de: i) retrasos en vuelos; ii) despacho en aduana; iii) revisiones que generen retrasos en entrega por paquetería nacional; iv) faltantes en mercancía; v) daños de embalaje; y/o vi) declaración errónea de mercancía por parte de EL CLIENTE y/o personal contratado o que le brinde un servicio a este último.\n\n' +
      'FIRMA DIGITAL. Las Partes manifiestan su consentimiento para el uso de la firma electrónica a través del proveedor de servicios de tecnología de firma electrónica y servicios de administración de transacciones digitales que LSD determine para facilitar el intercambio electrónico del Contrato y/o sus anexos correspondientes y comunicaciones que deban ser firmadas, dando el mismo valor a los documentos así firmados a como si estos hubieran sido firmados de forma autógrafa. No obstante, lo anterior, es del mutuo acuerdo de las Partes que LSD en cualquier momento podrá solicitar a EL CLIENTE que el documento sea rubricado en físico. La utilización de la firma electrónica tendrá como efecto el sometimiento expreso a las disposiciones del presente y, por lo tanto, surtirá efectos plenos para las Partes, frente a ellos mismos y frente a terceros. Las partes renuncian expresamente a argumentar desconocimiento de la firma electrónica que haya sido estampada en el presente Contrato.\n\n' +
      'FECHA DE FIRMA Y JURISDICCIÓN. Las partes acuerdan celebrar el presente Contrato el día de en el entendido que su consentimiento fue otorgado libre de todo vicio de voluntad, error, dolo, mala fe y/o violencia. Para la interpretación y cumplimiento de los presentes términos y condiciones, así como para todo aquello que no esté contemplado en los mismos, las partes acuerdan someterse a la jurisdicción y leyes aplicables en la ciudad de Monterrey, Nuevo León, renunciando expresamente a cualquier otro fuero que por razón de sus domicilios presentes o futuros pudiera corresponderles.'
  },
  {
    document_type: 'gex_warranty_policy',
    title: 'POLÍTICA DE GARANTÍA DE TIEMPO DE ENTREGA DE MERCANCÍA EN 90 DÍAS NATURALES',
    content:
      'En Logisti-k Systems Development S.A. de C.V. (en adelante "Grupo LSD") nos preocupamos por que nuestros clientes reciban sus cargas en tiempo, forma y en sus mejores condiciones, es por esto por lo que contamos con una forma de garantizar el tiempo de entrega de 90 (noventa) días naturales en el traslado de las mercancías (en adelante la "Garantía"). Lo anterior, en el entendido de que dicha garantía estará en todo momento sujeto a lo establecido en la presente política.\n\n' +
      'PRIMERA PARTE: DEFINICIONES\n\n' +
      'Para la interpretación de la presente política de garantía de traslado de mercancías, se deberá entender lo definido a continuación:\n\n' +
      '• Accidente: acontecimiento fortuito, súbito e imprevisto.\n' +
      '• Cliente: es la persona física y/o moral que ha solicitado a Grupo LSD llevar a cabo los servicios de traslado de mercancía(s) y ha optado voluntariamente contratar con la empresa Grupo LSD la garantía de tiempo de entrega de 90 (noventa) días naturales.\n' +
      '• Deducible: es la cantidad o porcentaje que se establece en esta Política como participación del Cliente para que pueda ser sujeto de una Indemnización por parte de Grupo LSD.\n' +
      '• Mercancía(s): se entiende como las mercancías y/o bienes contenidos en un solo vehículo o un mismo medio de transporte.\n' +
      '• Evento: es la ocurrencia del riesgo protegido por la Garantía, durante el traslado de las mercancías. Se entenderá por un solo Evento, el hecho o serie de hechos ocurridos a consecuencia de retraso de más de 90 (noventa) días naturales.\n' +
      '• Siniestro: retraso en el traslado de las mercancías por más de 90 (noventa) días naturales desde su envío siempre y cuando dicho retraso no se encuentre dentro de las excepciones de la Garantía.\n' +
      '• Valor de la(s) Mercancía(s): es la cantidad máxima establecida en las facturas y/o cualquier otra documentación en poder del Cliente para acreditar su propiedad.\n\n' +
      'SEGUNDA PARTE: CONDICIONES APLICABLES\n\n' +
      '1.- Esta Garantía ampara, sin exceder del valor de la(s) mercancía(s), la entrega de las mercancías en un periodo no mayor a 90 (noventa) días naturales a consecuencia de los riesgos descritos en la presente política, siempre que éstos sean súbitos e imprevistos, que no se encuentren excluidos, que ocurran entre el origen y el destino especificado y durante el curso normal del traslado.\n\n' +
      'Esta Política se ha creado con la finalidad de cubrir daños que ocurran y sean reclamados dentro del territorio nacional y conforme a los tribunales y la legislación de los Estados Unidos Mexicanos.\n\n' +
      'COSTO: MXN $625.00 + el 5% del valor de la(s) mercancía(s) a garantizar.\n\n' +
      'Ejemplo ilustrativo:\n' +
      'Envío: 100kg / 1 CBM\n' +
      'Valor: MXN $100,000 pesos\n' +
      'Costo de garantía: MXN $5,625.00 pesos\n\n' +
      'Requisitos para cotización:\n' +
      '• Dimensiones - Alto x Ancho x Largo\n' +
      '• Peso\n' +
      '• Valor de la(s) Mercancía(s) Declaradas\n\n' +
      'Nota: La mercancía se garantiza individualmente, puede garantizar solo la mercancía de alto riesgo.\n\n' +
      'En caso de que sea procedente el Siniestro, el reembolso será por un total del valor de las mercancías, adicional a pagar un 5% extra de Deducible.\n\n' +
      '2.- El único momento en el cual el Cliente podrá contratar la garantía es ANTES de realizar el tránsito y traslado de sus mercancías por Grupo LSD.\n\n' +
      '3.- En caso de Evento amparado, el Cliente deberá enviar a Grupo LSD una relación detallada y exacta de las mercancías no entregadas en plazo y el importe de las mismas.\n\n' +
      'El pago del Siniestro procedente se efectúa por transferencia o depósito a cuenta proporcionada por el Cliente en un lapso no mayor a 15 días hábiles después de tramitada la reclamación.\n\n' +
      'TERCERA PARTE: EXCLUSIONES\n\n' +
      'En ningún caso esta Póliza ampara las mercancías contra pérdidas, daños o gastos causados por:\n\n' +
      '• Retrasos derivados de procedimientos administrativos en materia aduanera.\n' +
      '• Violación por el Cliente a cualquier ley, disposición o reglamento expedidos por cualquier autoridad.\n' +
      '• Apropiación en derecho de la mercancía por personas facultadas a tener su posesión.\n' +
      '• Robo, fraude, dolo, mala fe, culpa grave, abuso de confianza cometido por el Cliente, sus funcionarios, empleados, socios o dependientes.\n' +
      '• Naturaleza perecedera inherente a las mercancías, vicio propio, combustión espontánea, merma natural, evaporación, pérdida natural de peso o volumen.\n' +
      '• Empleo de vehículos no aptos para el transporte o que resulten obsoletos, con fallas o defectos latentes.\n' +
      '• Extravío, robo o faltantes detectados DESPUÉS de la entrega de la mercancía.\n' +
      '• Faltantes descubiertos al efectuar inventarios.\n' +
      '• Falta de identificación de la mercancía que impida su diferenciación y recuperación.\n' +
      '• Falta de marcas o simbología internacional en el envase, empaque o embalaje.\n' +
      '• Exceso de peso y/o dimensiones máximas de carga autorizadas.\n' +
      '• Huelguistas, paros, disturbios de carácter obrero, motines o alborotos populares.\n' +
      '• Vicios ocultos de la mercancía.\n' +
      '• Expropiación, requisición, confiscación, incautación, nacionalización por acto de autoridad.\n' +
      '• Hostilidades, actividades u operaciones bélicas, invasión, guerra civil, revolución, rebelión, motín, sedición, sabotaje, disturbios políticos.\n' +
      '• Detonaciones con uso de dispositivos o armas de guerra que empleen fisión o fusión atómica, nuclear, radioactiva o armas biológicas.\n' +
      '• Saqueos o robos durante o después de fenómenos meteorológicos, sísmicos o eventos catastróficos.\n' +
      '• Dolo o mala fe del Cliente, sus beneficiarios o apoderados.\n\n' +
      'NOTA IMPORTANTE\n\n' +
      'En caso de siniestro a un porcentaje específico de la mercancía, se aplicará esta Política en proporción de lo siniestrado.\n\n' +
      'La garantía NO aplica para faltantes de inventario y/o problemas consecuentes con el mal empaque de la misma.'
  }
];

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

async function getActiveDocumentByType(documentType: string) {
  const result = await pool.query(
    `
      SELECT title, content, version, updated_at
      FROM legal_documents
      WHERE document_type = $1 AND is_active = true
      LIMIT 1
    `,
    [documentType]
  );

  return result.rows[0] || null;
}

// Garantiza que la tabla de versiones existe. La hacemos lazy desde el
// controller (no solo desde el startup) porque si la auto-migración del
// startup falla por cualquier query anterior, la tabla nunca se creaba
// y los snapshots se perdían. CREATE TABLE IF NOT EXISTS es idempotente
// y barato — preferimos garantía a "performance".
let __versionsTableEnsured = false;
async function ensureLegalDocumentVersionsTable() {
  if (__versionsTableEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS legal_document_versions (
        id SERIAL PRIMARY KEY,
        document_id INTEGER NOT NULL,
        document_type VARCHAR(64) NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        version INTEGER NOT NULL,
        saved_by INTEGER,
        saved_at TIMESTAMP NOT NULL DEFAULT NOW(),
        replaced_by_user_id INTEGER,
        replaced_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ldv_doc_version ON legal_document_versions(document_id, version DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ldv_doc_saved_at ON legal_document_versions(document_id, saved_at DESC)`);
    __versionsTableEnsured = true;
  } catch (err: any) {
    // No marcamos como ensured para reintentar la próxima vez.
    console.error('[legal-docs] No se pudo asegurar legal_document_versions:', err.message);
  }
}

async function ensureRequiredLegalDocuments() {
  for (const doc of REQUIRED_DOCUMENTS) {
    const exists = await pool.query(
      'SELECT id FROM legal_documents WHERE document_type = $1 LIMIT 1',
      [doc.document_type]
    );

    if (exists.rows.length === 0) {
      await pool.query(
        `
          INSERT INTO legal_documents (document_type, title, content, version, is_active)
          VALUES ($1, $2, $3, 1, true)
        `,
        [doc.document_type, doc.title, doc.content]
      );
    }
  }
}

// ==============================================================================
// CONTROLADOR DE DOCUMENTOS LEGALES - SUPER ADMIN
// ==============================================================================

/**
 * Obtiene todos los documentos legales
 * GET /api/legal-documents
 */
export async function getAllLegalDocuments(req: Request, res: Response) {
  try {
    await ensureRequiredLegalDocuments();

    const result = await pool.query(`
      SELECT 
        id,
        document_type,
        title,
        content,
        version,
        is_active,
        last_updated_by,
        created_at,
        updated_at
      FROM legal_documents 
      ORDER BY
        CASE document_type
          WHEN 'privacy_policy' THEN 1
          WHEN 'advisor_privacy_notice' THEN 2
          WHEN 'privacy_notice' THEN 3
          WHEN 'service_contract' THEN 4
          WHEN 'gex_warranty_policy' THEN 5
          ELSE 99
        END,
        document_type
    `);
    
    res.json({
      success: true,
      documents: result.rows
    });
  } catch (error) {
    console.error('Error obteniendo documentos legales:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener documentos legales'
    });
  }
}

/**
 * Obtiene un documento legal por tipo
 * GET /api/legal-documents/:type
 */
export async function getLegalDocumentByType(req: Request, res: Response) {
  try {
    const { type } = req.params;
    
    const result = await pool.query(`
      SELECT 
        id,
        document_type,
        title,
        content,
        version,
        is_active,
        updated_at
      FROM legal_documents 
      WHERE document_type = $1 AND is_active = true
    `, [type]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Documento no encontrado'
      });
    }
    
    res.json({
      success: true,
      document: result.rows[0]
    });
  } catch (error) {
    console.error('Error obteniendo documento legal:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener documento'
    });
  }
}

/**
 * Actualiza un documento legal
 * PUT /api/legal-documents/:id
 *
 * Antes de sobrescribir, archiva la versión que estaba activa en
 * legal_document_versions para no perder el histórico (requerimiento
 * legal: cualquier cambio queda auditable y se puede restaurar).
 */
export async function updateLegalDocument(req: Request, res: Response) {
  await ensureLegalDocumentVersionsTable();
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { title, content } = req.body;
    const userId = (req as any).user?.id || (req as any).user?.userId || null;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        error: 'Título y contenido son requeridos'
      });
    }

    await client.query('BEGIN');

    // 1) Leer el estado actual y archivarlo en versions ANTES de modificar.
    const currentRes = await client.query(
      `SELECT id, document_type, title, content, version, last_updated_by, updated_at
       FROM legal_documents WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (currentRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Documento no encontrado' });
    }
    const current = currentRes.rows[0];

    // No archivar si no hubo cambios reales (evita inflar versiones por
    // guardar dos veces lo mismo).
    const titleChanged = String(current.title) !== String(title);
    const contentChanged = String(current.content) !== String(content);
    if (!titleChanged && !contentChanged) {
      await client.query('ROLLBACK');
      return res.json({
        success: true,
        message: 'Sin cambios — el documento ya estaba al día.',
        document: current,
      });
    }

    await client.query(
      `INSERT INTO legal_document_versions
        (document_id, document_type, title, content, version, saved_by, saved_at, replaced_by_user_id, replaced_at)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()), $8, NOW())`,
      [
        current.id,
        current.document_type,
        current.title,
        current.content,
        current.version,
        current.last_updated_by,
        current.updated_at,
        userId,
      ]
    );

    // 2) Aplicar la actualización con la nueva versión incrementada.
    const result = await client.query(`
      UPDATE legal_documents
      SET
        title = $1,
        content = $2,
        version = version + 1,
        last_updated_by = $3,
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [title, content, userId, id]);

    await client.query('COMMIT');

    // audit_log es OPCIONAL y va FUERA de la transacción a propósito:
    // si la tabla no existe en este entorno, el INSERT lanza error y
    // dentro de la tx Postgres aborta TODA la transacción haciendo que
    // el COMMIT se comporte como ROLLBACK silencioso (causa del bug
    // donde la versión subía a v2 en la respuesta pero al refrescar
    // volvía a v1). Después del COMMIT ya el cambio está persistido,
    // así que el audit_log es solo "best effort".
    pool.query(`
      INSERT INTO audit_log (action, entity_type, entity_id, user_id, details)
      VALUES ('UPDATE_LEGAL_DOCUMENT', 'legal_documents', $1, $2, $3)
    `, [id, userId, JSON.stringify({ title, version: result.rows[0].version })]).catch(() => {
      // tabla no presente — el legal_document_versions ya garantiza la trazabilidad real.
    });

    res.json({
      success: true,
      message: 'Documento actualizado correctamente',
      document: result.rows[0]
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Error actualizando documento legal:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar documento'
    });
  } finally {
    client.release();
  }
}

/**
 * Restaura un documento legal a una versión previa.
 * POST /api/legal-documents/:id/versions/:versionId/restore
 *
 * El estado actual se archiva (igual que en updateLegalDocument) antes
 * de sobrescribir con el contenido de la versión seleccionada.
 */
export async function restoreLegalDocumentVersion(req: Request, res: Response) {
  await ensureLegalDocumentVersionsTable();
  const client = await pool.connect();
  try {
    const { id, versionId } = req.params;
    const userId = (req as any).user?.id || (req as any).user?.userId || null;

    await client.query('BEGIN');

    const versionRes = await client.query(
      `SELECT id, document_id, title, content, version
       FROM legal_document_versions
       WHERE id = $1 AND document_id = $2`,
      [versionId, id]
    );
    if (versionRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Versión no encontrada' });
    }
    const target = versionRes.rows[0];

    const currentRes = await client.query(
      `SELECT id, document_type, title, content, version, last_updated_by, updated_at
       FROM legal_documents WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (currentRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Documento no encontrado' });
    }
    const current = currentRes.rows[0];

    // Archivar el estado actual antes de restaurar.
    await client.query(
      `INSERT INTO legal_document_versions
        (document_id, document_type, title, content, version, saved_by, saved_at, replaced_by_user_id, replaced_at)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()), $8, NOW())`,
      [
        current.id,
        current.document_type,
        current.title,
        current.content,
        current.version,
        current.last_updated_by,
        current.updated_at,
        userId,
      ]
    );

    // Sobrescribir el documento con la versión objetivo (incrementando
    // version para mantener orden cronológico — restaurar es un cambio).
    const result = await client.query(
      `UPDATE legal_documents
       SET title = $1, content = $2, version = version + 1, last_updated_by = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [target.title, target.content, userId, id]
    );

    await client.query('COMMIT');

    // audit_log opcional FUERA de la tx (ver explicación en updateLegalDocument).
    pool.query(`
      INSERT INTO audit_log (action, entity_type, entity_id, user_id, details)
      VALUES ('RESTORE_LEGAL_DOCUMENT', 'legal_documents', $1, $2, $3)
    `, [id, userId, JSON.stringify({ restored_from_version: target.version, new_version: result.rows[0].version })])
    .catch(() => {});

    res.json({
      success: true,
      message: `Documento restaurado a la versión ${target.version}.`,
      document: result.rows[0],
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Error restaurando versión:', error);
    res.status(500).json({ success: false, error: 'Error al restaurar versión' });
  } finally {
    client.release();
  }
}

/**
 * Crea un nuevo documento legal
 * POST /api/legal-documents
 */
export async function createLegalDocument(req: Request, res: Response) {
  try {
    const { document_type, title, content } = req.body;
    const userId = (req as any).user?.id || null;
    
    if (!document_type || !title || !content) {
      return res.status(400).json({
        success: false,
        error: 'Tipo, título y contenido son requeridos'
      });
    }
    
    // Verificar si ya existe
    const exists = await pool.query(`
      SELECT id FROM legal_documents WHERE document_type = $1
    `, [document_type]);
    
    if (exists.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Ya existe un documento con ese tipo'
      });
    }
    
    const result = await pool.query(`
      INSERT INTO legal_documents (document_type, title, content, last_updated_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [document_type, title, content, userId]);
    
    res.status(201).json({
      success: true,
      message: 'Documento creado correctamente',
      document: result.rows[0]
    });
  } catch (error) {
    console.error('Error creando documento legal:', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear documento'
    });
  }
}

/**
 * Obtiene el historial de versiones de un documento.
 * GET /api/legal-documents/:id/history
 *
 * Devuelve cada snapshot completo (title + content + version) junto con
 * quién la editó originalmente y quién la reemplazó. La UI usa esto
 * para mostrar timeline + permitir vista previa y restaurar.
 */
export async function getLegalDocumentHistory(req: Request, res: Response) {
  await ensureLegalDocumentVersionsTable();
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
         v.id,
         v.document_id,
         v.document_type,
         v.title,
         v.content,
         v.version,
         v.saved_by,
         v.saved_at,
         v.replaced_by_user_id,
         v.replaced_at,
         saver.full_name AS saved_by_name,
         replacer.full_name AS replaced_by_name
       FROM legal_document_versions v
       LEFT JOIN users saver ON saver.id = v.saved_by
       LEFT JOIN users replacer ON replacer.id = v.replaced_by_user_id
       WHERE v.document_id = $1
       ORDER BY v.version DESC, v.replaced_at DESC
       LIMIT 50`,
      [id]
    );

    res.json({
      success: true,
      history: result.rows,
    });
  } catch (error) {
    console.error('Error obteniendo historial:', error);
    res.json({
      success: true,
      history: [],
    });
  }
}

// ==============================================================================
// ENDPOINTS PÚBLICOS - Para apps móviles y web
// ==============================================================================

/**
 * Obtiene el contrato de servicios activo (público)
 * GET /api/public/legal/service-contract
 */
export async function getPublicServiceContract(req: Request, res: Response) {
  try {
    const contract = await getActiveDocumentByType('service_contract');

    if (!contract) {
      return res.status(404).json({
        success: false,
        error: 'Contrato no encontrado'
      });
    }
    
    res.json({
      success: true,
      contract
    });
  } catch (error) {
    console.error('Error obteniendo contrato:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener contrato'
    });
  }
}

/**
 * Obtiene el aviso de privacidad activo (público)
 * GET /api/public/legal/privacy-notice
 */
export async function getPublicPrivacyNotice(req: Request, res: Response) {
  try {
    const privacyNotice = await getActiveDocumentByType('privacy_notice');

    if (!privacyNotice) {
      return res.status(404).json({
        success: false,
        error: 'Aviso de privacidad no encontrado'
      });
    }
    
    res.json({
      success: true,
      privacyNotice
    });
  } catch (error) {
    console.error('Error obteniendo aviso de privacidad:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener aviso de privacidad'
    });
  }
}

/**
 * Obtiene el aviso de privacidad de asesores (público)
 * GET /api/public/legal/advisor-privacy-notice
 */
export async function getPublicAdvisorPrivacyNotice(req: Request, res: Response) {
  try {
    const advisorPrivacyNotice = await getActiveDocumentByType('advisor_privacy_notice');

    if (!advisorPrivacyNotice) {
      return res.status(404).json({
        success: false,
        error: 'Aviso de privacidad para asesores no encontrado'
      });
    }

    res.json({
      success: true,
      advisorPrivacyNotice
    });
  } catch (error) {
    console.error('Error obteniendo aviso de privacidad para asesores:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener aviso de privacidad para asesores'
    });
  }
}

/**
 * Página pública HTML con políticas de privacidad de la empresa
 * GET /legal/privacy-policy
 */
export async function renderPublicPrivacyPoliciesPage(req: Request, res: Response) {
  try {
    const companyPrivacyPolicy = await getActiveDocumentByType('privacy_policy');

    if (!companyPrivacyPolicy) {
      return res.status(404).send('No hay políticas de privacidad publicadas');
    }

    const sections = [
      {
        heading: 'Política de Privacidad (Empresa)',
        ...companyPrivacyPolicy
      }
    ] as Array<{ heading: string; title: string; content: string; version: number; updated_at: string }>;

    const renderedSections = sections
      .map((section) => {
        const heading = escapeHtml(section.heading);
        const title = escapeHtml(section.title);
        const content = escapeHtml(section.content).replace(/\n/g, '<br/>');
        const updatedAt = new Date(section.updated_at).toLocaleString('es-MX');

        return `
          <section class="card">
            <h2>${heading}</h2>
            <h3>${title}</h3>
            <p class="meta">Versión ${section.version} · Actualizado: ${updatedAt}</p>
            <div class="content">${content}</div>
          </section>
        `;
      })
      .join('');

    const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Políticas de Privacidad | EntregaX</title>
    <style>
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f5f7fb; color:#1f2937; }
      .wrap { max-width: 980px; margin: 0 auto; padding: 24px 16px 48px; }
      .header { background:#111827; color:#fff; border-radius: 12px; padding: 24px; margin-bottom: 20px; }
      .header h1 { margin:0 0 8px; font-size: 28px; }
      .header p { margin:0; opacity:.9; }
      .card { background:#fff; border:1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
      .card h2 { margin: 0 0 8px; font-size: 18px; color:#f05a28; }
      .card h3 { margin: 0 0 6px; font-size: 22px; }
      .meta { color:#6b7280; font-size: 13px; margin: 0 0 14px; }
      .content { line-height: 1.7; white-space: normal; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="header">
        <h1>Políticas de Privacidad</h1>
        <p>Documentos legales oficiales de EntregaX</p>
      </div>
      ${renderedSections}
    </div>
  </body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch (error) {
    console.error('Error renderizando políticas de privacidad públicas:', error);
    res.status(500).send('Error al cargar políticas de privacidad');
  }
}

/**
 * Página pública HTML con instrucciones para eliminar cuenta de EntregaX.
 * Requisito de Google Play Data Safety y App Store App Privacy: debe existir
 * una URL pública (sin login) accesible desde fuera de la app que explique
 * el procedimiento de eliminación de cuenta y qué datos se eliminan/retienen.
 *
 * GET /eliminar-cuenta
 * GET /legal/account-deletion
 */
export async function renderAccountDeletionPage(_req: Request, res: Response) {
  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Eliminar mi cuenta | EntregaX</title>
    <meta name="description" content="Cómo eliminar tu cuenta de EntregaX y qué datos se eliminan o se conservan por obligaciones legales." />
    <meta name="robots" content="index, follow" />
    <style>
      :root { --brand:#f05a28; --ink:#111827; --muted:#6b7280; --line:#e5e7eb; --bg:#f5f7fb; --warn:#b91c1c; --warnBg:#fef2f2; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: var(--bg); color: var(--ink); }
      .wrap { max-width: 860px; margin: 0 auto; padding: 24px 16px 56px; }
      .header { background: var(--ink); color:#fff; border-radius: 12px; padding: 28px 24px; margin-bottom: 20px; }
      .header h1 { margin: 0 0 8px; font-size: 28px; }
      .header p { margin: 0; opacity: .9; }
      .card { background:#fff; border:1px solid var(--line); border-radius: 12px; padding: 22px; margin-bottom: 16px; }
      .card h2 { margin: 0 0 12px; font-size: 20px; color: var(--brand); }
      .card h3 { margin: 18px 0 8px; font-size: 16px; }
      .card p, .card li { line-height: 1.65; color: #1f2937; }
      .card ul, .card ol { padding-left: 22px; }
      .meta { color: var(--muted); font-size: 13px; margin: 0 0 16px; }
      .alert { background: var(--warnBg); border: 1px solid #fecaca; color: var(--warn); padding: 14px 16px; border-radius: 10px; margin-bottom: 14px; }
      .steps { counter-reset: step; list-style: none; padding: 0; }
      .steps li { position: relative; padding: 10px 12px 10px 44px; border-bottom: 1px solid var(--line); }
      .steps li:last-child { border-bottom: 0; }
      .steps li::before { counter-increment: step; content: counter(step); position: absolute; left: 12px; top: 12px; background: var(--brand); color:#fff; width: 24px; height: 24px; border-radius: 50%; text-align: center; line-height: 24px; font-size: 13px; font-weight: 600; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); font-size: 14px; vertical-align: top; }
      th { background: #f9fafb; color: var(--muted); font-weight: 600; }
      .contact { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 10px; padding: 14px 16px; }
      .contact a { color: #0369a1; text-decoration: none; font-weight: 600; }
      .footer { color: var(--muted); font-size: 12px; text-align: center; margin-top: 18px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="header">
        <h1>Eliminar mi cuenta de EntregaX</h1>
        <p>Información oficial sobre cómo solicitar la eliminación de tu cuenta y de tus datos personales.</p>
      </div>

      <div class="card">
        <h2>¿Quién puede solicitar la eliminación?</h2>
        <p>Cualquier persona titular de una cuenta de EntregaX (clientes, asesores y usuarios registrados en la aplicación móvil o el portal web) puede solicitar la eliminación de su cuenta y de los datos personales asociados, en cualquier momento y sin costo.</p>
      </div>

      <div class="card">
        <h2>Opción 1 · Eliminar desde la app (recomendado)</h2>
        <ol class="steps">
          <li>Abre la aplicación <strong>EntregaX</strong> en tu teléfono e inicia sesión.</li>
          <li>Ve a <strong>Mi Perfil → Seguridad → Eliminar mi cuenta</strong>.</li>
          <li>Confirma con tu contraseña actual y escribe la palabra <code>ELIMINAR</code> para validar.</li>
          <li>Recibirás confirmación inmediata y tu sesión se cerrará automáticamente.</li>
        </ol>
      </div>

      <div class="card">
        <h2>Opción 2 · Eliminar por correo (si no tienes acceso a la app)</h2>
        <p>Si no puedes ingresar a la aplicación, envía un correo desde la dirección registrada en tu cuenta a:</p>
        <div class="contact">
          📧 <a href="mailto:privacidad@entregax.com?subject=Solicitud%20de%20eliminaci%C3%B3n%20de%20cuenta">privacidad@entregax.com</a>
        </div>
        <h3>Incluye en tu correo:</h3>
        <ul>
          <li>Nombre completo registrado.</li>
          <li>Correo electrónico y/o teléfono asociado a la cuenta.</li>
          <li>Tu suite/box (si aplica) o número de cliente.</li>
          <li>Asunto: <em>"Solicitud de eliminación de cuenta"</em>.</li>
        </ul>
        <p>Atenderemos tu solicitud en un plazo máximo de <strong>30 días naturales</strong> conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) de México.</p>
      </div>

      <div class="card">
        <h2>¿Qué datos se eliminan?</h2>
        <p>Al confirmar la eliminación, se borran o anonimizan de forma irreversible los siguientes datos personales:</p>
        <ul>
          <li>Nombre, correo electrónico, teléfono y foto de perfil.</li>
          <li>Direcciones, contactos y preferencias guardadas.</li>
          <li>Tokens de sesión, dispositivos vinculados y notificaciones push.</li>
          <li>Anticipos pendientes (se cancelan automáticamente).</li>
          <li>Mensajes de soporte y conversaciones no esenciales para auditoría.</li>
        </ul>
      </div>

      <div class="card">
        <h2>¿Qué datos se conservan y por cuánto tiempo?</h2>
        <p>Por obligaciones fiscales, contables y de cumplimiento aduanal y antilavado, EntregaX está obligada a retener cierta información, aun después de la eliminación de la cuenta:</p>
        <table>
          <thead>
            <tr><th>Tipo de dato</th><th>Plazo de retención</th><th>Fundamento legal</th></tr>
          </thead>
          <tbody>
            <tr><td>Comprobantes fiscales (CFDI), facturas y notas de crédito</td><td>5 años</td><td>Art. 30 Código Fiscal de la Federación (CFF)</td></tr>
            <tr><td>Pedimentos aduanales y guías de envío internacional</td><td>5 años</td><td>Ley Aduanera</td></tr>
            <tr><td>Registros de pagos y movimientos contables</td><td>5 años</td><td>Art. 28 CFF</td></tr>
            <tr><td>Bitácora de auditoría (audit log) anonimizada</td><td>5 años</td><td>LFPDPPP, prevención de fraude</td></tr>
            <tr><td>Datos para reportes a autoridades (PLD/UIF, SAT)</td><td>10 años</td><td>Ley Federal para la Prevención e Identificación de Operaciones con Recursos de Procedencia Ilícita</td></tr>
          </tbody>
        </table>
        <p style="margin-top:14px">Estos datos se mantienen <strong>disociados de tu identidad activa</strong> y solo son accesibles ante requerimiento de autoridad competente.</p>
      </div>

      <div class="card">
        <h2>¿La eliminación es reversible?</h2>
        <div class="alert">
          ⚠️ <strong>No.</strong> Una vez confirmada la solicitud, la cuenta no puede recuperarse. Si en el futuro deseas volver a usar EntregaX, deberás registrarte como un usuario nuevo.
        </div>
      </div>

      <div class="card">
        <h2>Derechos ARCO</h2>
        <p>Antes de eliminar tu cuenta, también puedes ejercer cualquiera de tus derechos ARCO (Acceso, Rectificación, Cancelación y Oposición) o limitar el uso o divulgación de tus datos. Consulta nuestro <a href="/legal/privacy-policy">Aviso de Privacidad completo</a> o escríbenos a <a href="mailto:privacidad@entregax.com">privacidad@entregax.com</a>.</p>
      </div>

      <div class="card">
        <h2>Contacto del responsable</h2>
        <p><strong>Logística System Development S.A. de C.V.</strong> (EntregaX)<br/>
        Departamento de Privacidad y Protección de Datos<br/>
        📧 <a href="mailto:privacidad@entregax.com">privacidad@entregax.com</a></p>
      </div>

      <p class="footer">© ${new Date().getFullYear()} EntregaX · Última actualización: ${new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </div>
  </body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(html);
}
