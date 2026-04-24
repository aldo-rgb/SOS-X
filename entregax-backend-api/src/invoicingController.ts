import { Request, Response } from 'express';
import { pool } from './db';
import { FacturamaClient, FacturamaError } from './facturamaClient';

// ============================================
// SISTEMA DE FACTURACIÓN FISCAL CFDI
// Integración con Facturama (Multi-RFC, Multiemisor)
// ============================================

// ========== EMISORES (TUS EMPRESAS) ==========

// Obtener todas las empresas emisoras
export const getFiscalEmitters = async (req: Request, res: Response): Promise<any> => {
    try {
        const result = await pool.query(
            'SELECT id, alias, rfc, business_name, fiscal_regime, zip_code, is_active, created_at FROM fiscal_emitters ORDER BY id ASC'
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error getting fiscal emitters:', error);
        res.status(500).json({ error: 'Error al obtener empresas emisoras' });
    }
};

// Crear nueva empresa emisora
export const createFiscalEmitter = async (req: Request, res: Response): Promise<any> => {
    try {
        const { alias, rfc, business_name, fiscal_regime, zip_code, api_key } = req.body;

        if (!rfc || !business_name) {
            return res.status(400).json({ error: 'RFC y Razón Social son requeridos' });
        }

        const result = await pool.query(
            `INSERT INTO fiscal_emitters (alias, rfc, business_name, fiscal_regime, zip_code, api_key)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [alias, rfc.toUpperCase(), business_name, fiscal_regime, zip_code, api_key]
        );

        res.status(201).json({ message: 'Empresa creada exitosamente', emitter: result.rows[0] });
    } catch (error) {
        console.error('Error creating fiscal emitter:', error);
        res.status(500).json({ error: 'Error al crear empresa emisora' });
    }
};

// Actualizar empresa emisora
export const updateFiscalEmitter = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id, alias, rfc, business_name, fiscal_regime, zip_code, api_key, is_active } = req.body;

        const result = await pool.query(
            `UPDATE fiscal_emitters 
             SET alias = $1, rfc = $2, business_name = $3, fiscal_regime = $4, 
                 zip_code = $5, api_key = COALESCE($6, api_key), is_active = $7
             WHERE id = $8 RETURNING id, alias, rfc, business_name, fiscal_regime, zip_code, is_active`,
            [alias, rfc?.toUpperCase(), business_name, fiscal_regime, zip_code, api_key, is_active, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        res.json({ message: 'Empresa actualizada', emitter: result.rows[0] });
    } catch (error) {
        console.error('Error updating fiscal emitter:', error);
        res.status(500).json({ error: 'Error al actualizar empresa' });
    }
};

// Asignar emisor a tipo de servicio
export const assignEmitterToService = async (req: Request, res: Response): Promise<any> => {
    try {
        const { serviceId, emitterId } = req.body;

        await pool.query(
            'UPDATE commission_rates SET fiscal_emitter_id = $1 WHERE id = $2',
            [emitterId || null, serviceId]
        );

        res.json({ message: 'Empresa asignada al servicio correctamente' });
    } catch (error) {
        console.error('Error assigning emitter:', error);
        res.status(500).json({ error: 'Error al asignar empresa' });
    }
};

// ========== PERFILES FISCALES (CLIENTES) ==========

// Obtener perfiles fiscales de un usuario
export const getUserFiscalProfiles = async (req: Request, res: Response): Promise<any> => {
    try {
        const userId = (req as any).user?.id;
        
        const result = await pool.query(
            'SELECT * FROM fiscal_profiles WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC',
            [userId]
        );
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error getting fiscal profiles:', error);
        res.status(500).json({ error: 'Error al obtener perfiles fiscales' });
    }
};

// Crear perfil fiscal
export const createFiscalProfile = async (req: Request, res: Response): Promise<any> => {
    try {
        const userId = (req as any).user?.id;
        const { rfc, business_name, fiscal_regime, zip_code, tax_use, email, is_default } = req.body;

        if (!rfc || !business_name) {
            return res.status(400).json({ error: 'RFC y Razón Social son requeridos' });
        }

        // Si es default, quitar default de los demás
        if (is_default) {
            await pool.query('UPDATE fiscal_profiles SET is_default = FALSE WHERE user_id = $1', [userId]);
        }

        const result = await pool.query(
            `INSERT INTO fiscal_profiles (user_id, rfc, business_name, fiscal_regime, zip_code, tax_use, email, is_default)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [userId, rfc.toUpperCase(), business_name, fiscal_regime, zip_code, tax_use || 'G03', email, is_default || false]
        );

        res.status(201).json({ message: 'Perfil fiscal creado', profile: result.rows[0] });
    } catch (error) {
        console.error('Error creating fiscal profile:', error);
        res.status(500).json({ error: 'Error al crear perfil fiscal' });
    }
};

// Actualizar perfil fiscal
export const updateFiscalProfile = async (req: Request, res: Response): Promise<any> => {
    try {
        const userId = (req as any).user?.id;
        const { id, rfc, business_name, fiscal_regime, zip_code, tax_use, email, is_default } = req.body;

        // Verificar que pertenece al usuario
        const check = await pool.query('SELECT id FROM fiscal_profiles WHERE id = $1 AND user_id = $2', [id, userId]);
        if (check.rows.length === 0) {
            return res.status(403).json({ error: 'No tienes permiso para editar este perfil' });
        }

        if (is_default) {
            await pool.query('UPDATE fiscal_profiles SET is_default = FALSE WHERE user_id = $1', [userId]);
        }

        const result = await pool.query(
            `UPDATE fiscal_profiles 
             SET rfc = $1, business_name = $2, fiscal_regime = $3, zip_code = $4, 
                 tax_use = $5, email = $6, is_default = $7
             WHERE id = $8 RETURNING *`,
            [rfc?.toUpperCase(), business_name, fiscal_regime, zip_code, tax_use, email, is_default, id]
        );

        res.json({ message: 'Perfil actualizado', profile: result.rows[0] });
    } catch (error) {
        console.error('Error updating fiscal profile:', error);
        res.status(500).json({ error: 'Error al actualizar perfil' });
    }
};

// Eliminar perfil fiscal
export const deleteFiscalProfile = async (req: Request, res: Response): Promise<any> => {
    try {
        const userId = (req as any).user?.id;
        const { id } = req.params;

        await pool.query('DELETE FROM fiscal_profiles WHERE id = $1 AND user_id = $2', [id, userId]);
        res.json({ message: 'Perfil eliminado' });
    } catch (error) {
        console.error('Error deleting fiscal profile:', error);
        res.status(500).json({ error: 'Error al eliminar perfil' });
    }
};

// ========== FACTURACIÓN CON FACTURAPI ==========

// Mapeo de regímenes fiscales SAT a códigos
const FISCAL_REGIMES: { [key: string]: string } = {
    '601': 'General de Ley Personas Morales',
    '603': 'Personas Morales con Fines no Lucrativos',
    '605': 'Sueldos y Salarios e Ingresos Asimilados a Salarios',
    '606': 'Arrendamiento',
    '607': 'Régimen de Enajenación o Adquisición de Bienes',
    '608': 'Demás ingresos',
    '610': 'Residentes en el Extranjero sin Establecimiento Permanente',
    '611': 'Ingresos por Dividendos',
    '612': 'Personas Físicas con Actividades Empresariales y Profesionales',
    '614': 'Ingresos por intereses',
    '615': 'Régimen de los ingresos por obtención de premios',
    '616': 'Sin obligaciones fiscales',
    '620': 'Sociedades Cooperativas de Producción',
    '621': 'Incorporación Fiscal',
    '622': 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras',
    '623': 'Opcional para Grupos de Sociedades',
    '624': 'Coordinados',
    '625': 'Régimen de las Actividades Empresariales con ingresos por Plataformas Tecnológicas',
    '626': 'Régimen Simplificado de Confianza'
};

// Mapeo de usos CFDI
const TAX_USES: { [key: string]: string } = {
    'G01': 'Adquisición de mercancías',
    'G02': 'Devoluciones, descuentos o bonificaciones',
    'G03': 'Gastos en general',
    'I01': 'Construcciones',
    'I02': 'Mobiliario y equipo de oficina',
    'I03': 'Equipo de transporte',
    'I04': 'Equipo de cómputo y accesorios',
    'D01': 'Honorarios médicos, dentales y gastos hospitalarios',
    'D02': 'Gastos médicos por incapacidad o discapacidad',
    'D03': 'Gastos funerales',
    'D04': 'Donativos',
    'S01': 'Sin efectos fiscales',
    'CP01': 'Pagos',
    'CN01': 'Nómina'
};

// Generar factura con FACTURAPI (CFDI Real)
export const generateInvoice = async (req: Request, res: Response): Promise<any> => {
    try {
        const { consolidationId, fiscalProfileId, paymentForm } = req.body;
        const userId = (req as any).user?.id;

        // 1. Obtener datos de la Orden y Empresa Emisora (con credenciales Facturama)
        const orderQuery = await pool.query(
            `SELECT c.id, c.payment_status, c.shipping_cost, c.service_type, c.user_id,
                    fe.id as emitter_id, fe.rfc as emitter_rfc, fe.business_name as emitter_name,
                    fe.fiscal_regime as emitter_regime, fe.zip_code as emitter_zip,
                    fe.facturama_username, fe.facturama_password, fe.facturama_environment
             FROM consolidations c
             LEFT JOIN commission_rates cr ON c.service_type = cr.service_type
             LEFT JOIN fiscal_emitters fe ON cr.fiscal_emitter_id = fe.id
             WHERE c.id = $1`, 
            [consolidationId]
        );

        const order = orderQuery.rows[0];

        if (!order) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        if (order.user_id !== userId) {
            return res.status(403).json({ error: 'No tienes permiso para facturar esta orden' });
        }

        if (order.payment_status !== 'paid') {
            return res.status(400).json({ error: 'Solo se pueden facturar órdenes pagadas' });
        }

        // Verificar si ya tiene factura
        const existingInvoice = await pool.query(
            'SELECT uuid FROM invoices WHERE consolidation_id = $1 AND status = $2',
            [consolidationId, 'generated']
        );
        if (existingInvoice.rows.length > 0) {
            return res.status(400).json({ error: 'Esta orden ya fue facturada', uuid: existingInvoice.rows[0].uuid });
        }

        if (!order.facturama_username || !order.facturama_password) {
            return res.status(500).json({ error: 'Este servicio no tiene empresa facturadora asignada o falta la configuración Facturama (username/password) en el emisor.' });
        }

        // 2. Obtener Datos del Cliente (Receptor)
        const clientQuery = await pool.query(
            'SELECT * FROM fiscal_profiles WHERE id = $1 AND user_id = $2',
            [fiscalProfileId, userId]
        );
        const client = clientQuery.rows[0];

        if (!client) {
            return res.status(400).json({ error: 'Perfil fiscal no encontrado' });
        }

        // 3. Inicializar Facturama con las credenciales del emisor (Multi-RFC / Multiemisor)
        const facturama = new FacturamaClient({
            id: order.emitter_id,
            rfc: order.emitter_rfc,
            business_name: order.emitter_name,
            fiscal_regime: order.emitter_regime,
            zip_code: order.emitter_zip,
            facturama_username: order.facturama_username,
            facturama_password: order.facturama_password,
            facturama_environment: order.facturama_environment
        });

        // 4. Determinar clave de producto SAT según servicio
        let productKey = '78101802'; // Default: Servicios de transporte de carga aérea
        let productDescription = `Servicio de envío consolidado #${consolidationId}`;
        
        if (order.service_type.includes('maritimo')) {
            productKey = '78101801'; // Servicios de transporte de carga marítima
            productDescription = `Servicio de envío marítimo consolidado #${consolidationId}`;
        } else if (order.service_type.includes('terrestre') || order.service_type.includes('pobox')) {
            productKey = '78101803'; // Servicios de transporte de carga terrestre
            productDescription = `Servicio de paquetería USA-México #${consolidationId}`;
        }

        const unitPrice = parseFloat(order.shipping_cost);

        console.log('📄 Generando factura con Facturama...');
        console.log(`   Emisor: ${order.emitter_name} (${order.emitter_rfc})`);
        console.log(`   Receptor: ${client.business_name} (${client.rfc})`);
        console.log(`   Monto: $${unitPrice} MXN`);

        // 5. Crear Factura REAL en el SAT vía Facturama
        const invoice = await facturama.invoices.create({
            customer: {
                legal_name: client.business_name,
                tax_id: client.rfc,
                tax_system: client.fiscal_regime, // Ej. '601'
                address: {
                    zip: client.zip_code
                },
                email: client.email
            },
            items: [{
                quantity: 1,
                product: {
                    description: productDescription,
                    product_key: productKey,
                    price: unitPrice,
                    taxes: [{
                        type: 'IVA',
                        rate: 0.16
                    }]
                }
            }],
            payment_form: paymentForm || '04',
            use: client.tax_use || 'G03'
        });

        console.log('✅ Factura timbrada exitosamente:', invoice.uuid);

        // 6. Guardar Factura en BD
        await pool.query(
            `INSERT INTO invoices (consolidation_id, fiscal_emitter_id, fiscal_profile_id, uuid, folio, status, pdf_url, xml_url, amount, facturama_id)
             VALUES ($1, $2, $3, $4, $5, 'generated', $6, $7, $8, $9)`,
            [
                consolidationId, 
                order.emitter_id, 
                client.id, 
                invoice.uuid, 
                invoice.folio_number?.toString() || (invoice.series || '') + invoice.folio_number,
                invoice.pdf_url,
                invoice.xml_url,
                unitPrice,
                invoice.id
            ]
        );

        res.json({ 
            message: 'Factura timbrada exitosamente',
            invoice: {
                uuid: invoice.uuid,
                folio: invoice.folio_number,
                series: invoice.series,
                pdf_url: invoice.verification_url,
                xml_url: invoice.verification_url,
                amount: unitPrice,
                total: invoice.total,
                emitter: order.emitter_name,
                receiver: client.business_name,
                status: invoice.status,
                stamp_date: invoice.stamp?.date
            }
        });

    } catch (error: any) {
        console.error('❌ Error Facturama:', error.message || error);
        
        if (error?.type === 'FacturamaError' || error instanceof FacturamaError) {
            return res.status(400).json({ 
                error: 'Error al timbrar factura', 
                details: error.message,
                code: error.code
            });
        }

        res.status(500).json({ error: 'Error al generar factura', details: error.message });
    }
};

// Descargar PDF de factura
export const downloadInvoicePdf = async (req: Request, res: Response): Promise<any> => {
    try {
        const { invoiceId } = req.params;

        const invoiceQuery = await pool.query(
            `SELECT i.uuid, i.facturama_id, i.fiscal_emitter_id
             FROM invoices i
             WHERE i.id = $1`,
            [invoiceId]
        );

        const invoice = invoiceQuery.rows[0];
        if (!invoice) {
            return res.status(404).json({ error: 'Factura no encontrada' });
        }

        const facturama = await FacturamaClient.fromEmitterId(invoice.fiscal_emitter_id);
        const buf = await facturama.invoices.downloadPdf(invoice.facturama_id || invoice.uuid);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=factura-${invoice.uuid}.pdf`);
        res.send(buf);

    } catch (error: any) {
        console.error('Error downloading PDF:', error);
        res.status(500).json({ error: 'Error al descargar PDF', details: error.message });
    }
};

// Descargar XML de factura
export const downloadInvoiceXml = async (req: Request, res: Response): Promise<any> => {
    try {
        const { invoiceId } = req.params;

        const invoiceQuery = await pool.query(
            `SELECT i.uuid, i.facturama_id, i.fiscal_emitter_id
             FROM invoices i
             WHERE i.id = $1`,
            [invoiceId]
        );

        const invoice = invoiceQuery.rows[0];
        if (!invoice) {
            return res.status(404).json({ error: 'Factura no encontrada' });
        }

        const facturama = await FacturamaClient.fromEmitterId(invoice.fiscal_emitter_id);
        const xml = await facturama.invoices.downloadXml(invoice.facturama_id || invoice.uuid);

        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', `attachment; filename=factura-${invoice.uuid}.xml`);
        res.send(xml);

    } catch (error: any) {
        console.error('Error downloading XML:', error);
        res.status(500).json({ error: 'Error al descargar XML', details: error.message });
    }
};

// Enviar factura por email
export const sendInvoiceByEmail = async (req: Request, res: Response): Promise<any> => {
    try {
        const { invoiceId, email } = req.body;

        const invoiceQuery = await pool.query(
            `SELECT i.uuid, i.facturama_id, i.fiscal_emitter_id
             FROM invoices i
             WHERE i.id = $1`,
            [invoiceId]
        );

        const invoice = invoiceQuery.rows[0];
        if (!invoice) {
            return res.status(404).json({ error: 'Factura no encontrada' });
        }

        const facturama = await FacturamaClient.fromEmitterId(invoice.fiscal_emitter_id);
        await facturama.invoices.sendByEmail(invoice.facturama_id || invoice.uuid, { email });

        res.json({ message: 'Factura enviada por email exitosamente' });

    } catch (error: any) {
        console.error('Error sending invoice by email:', error);
        res.status(500).json({ error: 'Error al enviar factura' });
    }
};

// Obtener facturas de un usuario
export const getUserInvoices = async (req: Request, res: Response): Promise<any> => {
    try {
        const userId = (req as any).user?.id;

        const result = await pool.query(
            `SELECT i.*, fe.alias as emitter_alias, fe.rfc as emitter_rfc,
                    fp.rfc as receiver_rfc, fp.business_name as receiver_name
             FROM invoices i
             JOIN consolidations c ON i.consolidation_id = c.id
             LEFT JOIN fiscal_emitters fe ON i.fiscal_emitter_id = fe.id
             LEFT JOIN fiscal_profiles fp ON i.fiscal_profile_id = fp.id
             WHERE c.user_id = $1
             ORDER BY i.created_at DESC`,
            [userId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Error getting invoices:', error);
        res.status(500).json({ error: 'Error al obtener facturas' });
    }
};

// Admin: Obtener todas las facturas
export const getAllInvoices = async (req: Request, res: Response): Promise<any> => {
    try {
        const result = await pool.query(
            `SELECT i.*, 
                    fe.alias as emitter_alias, fe.rfc as emitter_rfc,
                    fp.rfc as receiver_rfc, fp.business_name as receiver_name,
                    u.full_name as client_name
             FROM invoices i
             JOIN consolidations c ON i.consolidation_id = c.id
             JOIN users u ON c.user_id = u.id
             LEFT JOIN fiscal_emitters fe ON i.fiscal_emitter_id = fe.id
             LEFT JOIN fiscal_profiles fp ON i.fiscal_profile_id = fp.id
             ORDER BY i.created_at DESC
             LIMIT 100`
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Error getting all invoices:', error);
        res.status(500).json({ error: 'Error al obtener facturas' });
    }
};

// Cancelar factura con FACTURAPI
export const cancelInvoice = async (req: Request, res: Response): Promise<any> => {
    try {
        const { invoiceId, motive } = req.body;
        // Motivos de cancelación SAT:
        // '01' = Comprobante emitido con errores con relación
        // '02' = Comprobante emitido con errores sin relación  
        // '03' = No se llevó a cabo la operación
        // '04' = Operación nominativa relacionada en la factura global

        const invoiceQuery = await pool.query(
            `SELECT i.*, i.facturama_id
             FROM invoices i
             WHERE i.id = $1`,
            [invoiceId]
        );

        const invoice = invoiceQuery.rows[0];

        if (!invoice) {
            return res.status(404).json({ error: 'Factura no encontrada' });
        }

        if (invoice.status === 'cancelled') {
            return res.status(400).json({ error: 'La factura ya está cancelada' });
        }

        // Cancelar en SAT vía Facturama
        const facturama = await FacturamaClient.fromEmitterId(invoice.fiscal_emitter_id);
        await facturama.invoices.cancel(invoice.facturama_id || invoice.uuid, {
            motive: motive || '02' // Default: Error sin relación
        });

        // Actualizar estado en BD
        await pool.query(
            'UPDATE invoices SET status = $1 WHERE id = $2',
            ['cancelled', invoiceId]
        );

        console.log(`🗑️ Factura ${invoice.uuid} cancelada ante el SAT`);

        res.json({ message: 'Factura cancelada exitosamente ante el SAT' });

    } catch (error: any) {
        console.error('Error cancelling invoice:', error);
        
        if (error?.type === 'FacturamaError' || error instanceof FacturamaError) {
            return res.status(400).json({ 
                error: 'Error al cancelar factura', 
                details: error.message 
            });
        }

        res.status(500).json({ error: 'Error al cancelar factura' });
    }
};

// Validar RFC ante SAT
export const validateRfc = async (req: Request, res: Response): Promise<any> => {
    try {
        const { rfc } = req.body;

        if (!rfc) {
            return res.status(400).json({ error: 'RFC es requerido' });
        }

        const facturama = await FacturamaClient.firstActive();
        const validation = await facturama.tools.validateTaxId(rfc);

        res.json({
            rfc: rfc.toUpperCase(),
            valid: validation.is_valid,
            exists_in_sat: validation.exists_in_sat,
            message: validation.is_valid ? 'RFC válido' : 'RFC inválido'
        });

    } catch (error: any) {
        console.error('Error validating RFC:', error);
        res.status(500).json({ error: 'Error al validar RFC' });
    }
};

// Obtener catálogos SAT
export const getSatCatalogs = async (req: Request, res: Response): Promise<any> => {
    try {
        res.json({
            fiscal_regimes: FISCAL_REGIMES,
            tax_uses: TAX_USES,
            payment_forms: {
                '01': 'Efectivo',
                '02': 'Cheque nominativo',
                '03': 'Transferencia electrónica de fondos',
                '04': 'Tarjeta de crédito',
                '28': 'Tarjeta de débito',
                '31': 'Intermediario pagos',
                '99': 'Por definir'
            },
            cancellation_motives: {
                '01': 'Comprobante emitido con errores con relación',
                '02': 'Comprobante emitido con errores sin relación',
                '03': 'No se llevó a cabo la operación',
                '04': 'Operación nominativa relacionada en factura global'
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener catálogos' });
    }
};

// ============================================
// FACTURACIÓN POR SERVICIO
// Asignación de razones sociales y control de facturación
// ============================================

// Obtener configuración fiscal por servicio
export const getServiceFiscalConfig = async (req: Request, res: Response): Promise<any> => {
    try {
        const { serviceType } = req.params;
        
        const result = await pool.query(`
            SELECT sfc.*, fe.alias, fe.rfc, fe.business_name, fe.is_active as emitter_active
            FROM service_fiscal_config sfc
            JOIN fiscal_emitters fe ON sfc.fiscal_emitter_id = fe.id
            WHERE sfc.service_type = $1
            ORDER BY sfc.is_default DESC, fe.alias ASC
        `, [serviceType]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error getting service fiscal config:', error);
        res.status(500).json({ error: 'Error al obtener configuración fiscal del servicio' });
    }
};

// Obtener todas las configuraciones fiscales (todos los servicios)
export const getAllServiceFiscalConfig = async (req: Request, res: Response): Promise<any> => {
    try {
        const result = await pool.query(`
            SELECT sfc.*, fe.alias, fe.rfc, fe.business_name, fe.is_active as emitter_active
            FROM service_fiscal_config sfc
            JOIN fiscal_emitters fe ON sfc.fiscal_emitter_id = fe.id
            ORDER BY sfc.service_type, sfc.is_default DESC
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error getting all service fiscal configs:', error);
        res.status(500).json({ error: 'Error al obtener configuraciones fiscales' });
    }
};

// Asignar razón social a un servicio
export const assignFiscalToService = async (req: Request, res: Response): Promise<any> => {
    try {
        const { serviceType, fiscalEmitterId, isDefault } = req.body;
        
        if (!serviceType || !fiscalEmitterId) {
            return res.status(400).json({ error: 'Servicio y empresa emisora son requeridos' });
        }
        
        // Si es default, quitar default de los demás del mismo servicio
        if (isDefault) {
            await pool.query(
                'UPDATE service_fiscal_config SET is_default = FALSE WHERE service_type = $1',
                [serviceType]
            );
        }
        
        const result = await pool.query(`
            INSERT INTO service_fiscal_config (service_type, fiscal_emitter_id, is_default)
            VALUES ($1, $2, $3)
            ON CONFLICT (service_type, fiscal_emitter_id) 
            DO UPDATE SET is_default = $3, updated_at = NOW()
            RETURNING *
        `, [serviceType, fiscalEmitterId, isDefault || false]);
        
        res.json({ message: 'Razón social asignada al servicio', config: result.rows[0] });
    } catch (error) {
        console.error('Error assigning fiscal to service:', error);
        res.status(500).json({ error: 'Error al asignar razón social' });
    }
};

// Quitar razón social de un servicio
export const removeFiscalFromService = async (req: Request, res: Response): Promise<any> => {
    try {
        const { serviceType, fiscalEmitterId } = req.body;
        
        await pool.query(
            'DELETE FROM service_fiscal_config WHERE service_type = $1 AND fiscal_emitter_id = $2',
            [serviceType, fiscalEmitterId]
        );
        
        res.json({ message: 'Razón social removida del servicio' });
    } catch (error) {
        console.error('Error removing fiscal from service:', error);
        res.status(500).json({ error: 'Error al remover razón social' });
    }
};

// Establecer razón social como default para un servicio
export const setDefaultFiscalForService = async (req: Request, res: Response): Promise<any> => {
    try {
        const { serviceType, fiscalEmitterId } = req.body;
        
        // Quitar default de todos
        await pool.query(
            'UPDATE service_fiscal_config SET is_default = FALSE WHERE service_type = $1',
            [serviceType]
        );
        
        // Establecer nuevo default
        await pool.query(
            'UPDATE service_fiscal_config SET is_default = TRUE, updated_at = NOW() WHERE service_type = $1 AND fiscal_emitter_id = $2',
            [serviceType, fiscalEmitterId]
        );
        
        res.json({ message: 'Razón social establecida como predeterminada' });
    } catch (error) {
        console.error('Error setting default fiscal:', error);
        res.status(500).json({ error: 'Error al establecer predeterminada' });
    }
};

// Obtener facturas por servicio
export const getServiceInvoices = async (req: Request, res: Response): Promise<any> => {
    try {
        const { serviceType } = req.params;
        const { limit = 50, offset = 0, status, fiscalEmitterId } = req.query;
        
        let query = `
            SELECT si.*, fe.alias as emitter_alias, fe.rfc as emitter_rfc, fe.business_name as emitter_name
            FROM service_invoices si
            LEFT JOIN fiscal_emitters fe ON si.fiscal_emitter_id = fe.id
            WHERE si.service_type = $1
        `;
        const params: any[] = [serviceType];
        let paramIndex = 2;
        
        if (status) {
            query += ` AND si.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }
        
        if (fiscalEmitterId) {
            query += ` AND si.fiscal_emitter_id = $${paramIndex}`;
            params.push(fiscalEmitterId);
            paramIndex++;
        }
        
        query += ` ORDER BY si.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);
        
        const result = await pool.query(query, params);
        
        // Obtener totales
        const totals = await pool.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'timbrada') as timbradas,
                COUNT(*) FILTER (WHERE status = 'pending') as pendientes,
                COUNT(*) FILTER (WHERE status = 'cancelled') as canceladas,
                COALESCE(SUM(amount) FILTER (WHERE status = 'timbrada'), 0) as total_facturado
            FROM service_invoices
            WHERE service_type = $1
        `, [serviceType]);
        
        res.json({
            invoices: result.rows,
            totals: totals.rows[0]
        });
    } catch (error) {
        console.error('Error getting service invoices:', error);
        res.status(500).json({ error: 'Error al obtener facturas del servicio' });
    }
};

// Crear factura para servicio
export const createServiceInvoice = async (req: Request, res: Response): Promise<any> => {
    try {
        const { 
            serviceType, 
            fiscalEmitterId, 
            receiverRfc, 
            receiverName, 
            amount, 
            concept,
            currency = 'MXN',
            notes
        } = req.body;
        
        if (!serviceType || !fiscalEmitterId || !receiverRfc || !amount) {
            return res.status(400).json({ error: 'Faltan campos requeridos' });
        }
        
        const result = await pool.query(`
            INSERT INTO service_invoices 
            (service_type, fiscal_emitter_id, receiver_rfc, receiver_name, amount, currency, concept, notes, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
            RETURNING *
        `, [serviceType, fiscalEmitterId, receiverRfc.toUpperCase(), receiverName, amount, currency, concept, notes]);
        
        res.status(201).json({ message: 'Factura creada', invoice: result.rows[0] });
    } catch (error) {
        console.error('Error creating service invoice:', error);
        res.status(500).json({ error: 'Error al crear factura' });
    }
};

// Timbrar factura de servicio
export const stampServiceInvoice = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        
        // Obtener la factura y el emisor (con credenciales Facturama)
        const invoiceQuery = await pool.query(`
            SELECT si.*, fe.rfc as emitter_rfc, fe.business_name as emitter_name,
                   fe.fiscal_regime as emitter_regime, fe.zip_code as emitter_zip,
                   fe.facturama_username, fe.facturama_password, fe.facturama_environment
            FROM service_invoices si
            JOIN fiscal_emitters fe ON si.fiscal_emitter_id = fe.id
            WHERE si.id = $1
        `, [id]);
        
        if (invoiceQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Factura no encontrada' });
        }
        
        const invoice = invoiceQuery.rows[0];
        
        if (!invoice.facturama_username || !invoice.facturama_password) {
            return res.status(400).json({ error: 'El emisor no tiene credenciales Facturama configuradas' });
        }
        
        // Timbrar con Facturama
        const facturama = new FacturamaClient({
            id: invoice.fiscal_emitter_id,
            rfc: invoice.emitter_rfc,
            business_name: invoice.emitter_name,
            fiscal_regime: invoice.emitter_regime,
            zip_code: invoice.emitter_zip,
            facturama_username: invoice.facturama_username,
            facturama_password: invoice.facturama_password,
            facturama_environment: invoice.facturama_environment
        });
        
        const cfdi = await facturama.invoices.create({
            type: 'I',
            customer: {
                legal_name: invoice.receiver_name,
                tax_id: invoice.receiver_rfc,
                tax_system: '601',
                address: { zip: '00000' }
            },
            items: [{
                quantity: 1,
                product: {
                    description: invoice.concept || 'Servicio de logística',
                    price: parseFloat(invoice.amount),
                    product_key: '78101500'
                }
            }],
            payment_form: '03',
            payment_method: 'PUE',
            use: 'G03'
        });
        
        // Actualizar factura con datos del timbrado
        await pool.query(`
            UPDATE service_invoices 
            SET status = 'timbrada', 
                invoice_uuid = $1, 
                invoice_folio = $2,
                pdf_url = $3,
                xml_url = $4,
                facturama_id = $5,
                timbrado_at = NOW()
            WHERE id = $6
        `, [cfdi.uuid, cfdi.folio_number, cfdi.pdf_url, cfdi.xml_url, cfdi.id, id]);
        
        res.json({ 
            message: 'Factura timbrada exitosamente', 
            uuid: cfdi.uuid,
            folio: cfdi.folio_number,
            pdf_url: cfdi.pdf_url,
            xml_url: cfdi.xml_url
        });
    } catch (error: any) {
        console.error('Error stamping service invoice:', error);
        res.status(500).json({ error: error.message || 'Error al timbrar factura' });
    }
};

// Obtener resumen de facturación por servicio
export const getServiceInvoicingSummary = async (req: Request, res: Response): Promise<any> => {
    try {
        const result = await pool.query(`
            SELECT 
                si.service_type,
                fe.alias as emitter_alias,
                fe.rfc as emitter_rfc,
                COUNT(*) as total_facturas,
                COUNT(*) FILTER (WHERE si.status = 'timbrada') as timbradas,
                COUNT(*) FILTER (WHERE si.status = 'pending') as pendientes,
                COALESCE(SUM(si.amount) FILTER (WHERE si.status = 'timbrada'), 0) as total_facturado,
                MAX(si.created_at) as ultima_factura
            FROM service_invoices si
            LEFT JOIN fiscal_emitters fe ON si.fiscal_emitter_id = fe.id
            GROUP BY si.service_type, fe.id, fe.alias, fe.rfc
            ORDER BY si.service_type, total_facturado DESC
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error getting invoicing summary:', error);
        res.status(500).json({ error: 'Error al obtener resumen' });
    }
};

// ========== CONFIGURACIÓN DE SERVICIOS POR EMPRESA ==========

// Obtener configuración de servicios
export const getServiceCompanyConfig = async (req: Request, res: Response): Promise<any> => {
    try {
        const result = await pool.query(`
            SELECT 
                scc.id,
                scc.service_type,
                scc.service_name,
                scc.emitter_id,
                scc.is_active,
                fe.alias as emitter_alias,
                fe.rfc as emitter_rfc,
                fe.business_name as emitter_business_name
            FROM service_company_config scc
            LEFT JOIN fiscal_emitters fe ON scc.emitter_id = fe.id
            ORDER BY scc.id
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error getting service company config:', error);
        res.status(500).json({ error: 'Error al obtener configuración de servicios' });
    }
};

// Actualizar configuración de servicio (asignar empresa)
export const updateServiceCompanyConfig = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const { emitter_id, is_active } = req.body;

        const result = await pool.query(`
            UPDATE service_company_config 
            SET emitter_id = $1, is_active = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING *
        `, [emitter_id || null, is_active !== false, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Configuración no encontrada' });
        }

        // Obtener datos completos con la empresa
        const updated = await pool.query(`
            SELECT 
                scc.*,
                fe.alias as emitter_alias,
                fe.rfc as emitter_rfc,
                fe.business_name as emitter_business_name
            FROM service_company_config scc
            LEFT JOIN fiscal_emitters fe ON scc.emitter_id = fe.id
            WHERE scc.id = $1
        `, [id]);

        console.log(`✅ Servicio ${id} actualizado: empresa_id=${emitter_id}`);
        res.json({ message: 'Configuración actualizada', config: updated.rows[0] });
    } catch (error) {
        console.error('Error updating service company config:', error);
        res.status(500).json({ error: 'Error al actualizar configuración' });
    }
};

// Obtener empresa asignada a un tipo de servicio (para instrucciones de pago)
export const getEmitterByServiceType = async (req: Request, res: Response): Promise<any> => {
    try {
        const { service_type } = req.params;

        const result = await pool.query(`
            SELECT 
                scc.service_type,
                scc.service_name,
                fe.id as emitter_id,
                fe.alias as emitter_alias,
                fe.rfc as emitter_rfc,
                fe.business_name,
                fe.openpay_configured,
                fe.openpay_production_mode
            FROM service_company_config scc
            LEFT JOIN fiscal_emitters fe ON scc.emitter_id = fe.id
            WHERE scc.service_type = $1 AND scc.is_active = TRUE
        `, [service_type]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Servicio no configurado' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error getting emitter by service type:', error);
        res.status(500).json({ error: 'Error al obtener configuración' });
    }
};
