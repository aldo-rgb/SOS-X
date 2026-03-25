-- Migración: Agregar Aviso de Privacidad para Asesores Comerciales
-- Fecha: 25 de Marzo de 2026

INSERT INTO legal_documents (document_type, title, content, version, is_active)
VALUES (
  'advisor_privacy_notice',
  'AVISO DE PRIVACIDAD Y TÉRMINOS DE COMISIONES PARA ASESORES COMERCIALES',
  '1. IDENTIDAD Y DOMICILIO DEL RESPONSABLE

Logística System Development S.A. de C.V. (en adelante "EntregaX"), con domicilio en Revolución Sur 3866 B8, Torremolinos, Monterrey, Nuevo León, C.P. 64860, es el responsable del uso y protección de sus datos personales.

2. DATOS PERSONALES QUE RECABAMOS

De nuestros Asesores Comerciales recabamos: Nombre completo, domicilio, teléfono, correo electrónico, datos bancarios para pago de comisiones, información fiscal (RFC y Constancia de Situación Fiscal) y fotografía de identificación oficial (INE).

3. FINALIDADES DEL TRATAMIENTO

Alta en nuestro sistema como Asesor Comercial, gestión y seguimiento de clientes referidos, cálculo y pago de comisiones, emisión de comprobantes fiscales, comunicación sobre promociones y actualizaciones del programa de asesores, y contacto para asuntos relacionados con su actividad comercial.

4. ESQUEMA DE COMISIONES

Como Asesor Comercial de EntregaX, usted recibirá comisiones por los envíos generados por los clientes que usted refiera a la plataforma. Las comisiones se calcularán con base en el volumen de envíos de sus clientes referidos, de acuerdo con las tablas de comisiones vigentes publicadas en el sistema. EntregaX se reserva el derecho de modificar los porcentajes y esquemas de comisiones, notificando previamente a los asesores a través del sistema.

5. PROCESO DE PAGO DE COMISIONES

Las comisiones se gestionan a través de nuestro sistema digital. El proceso es el siguiente:

• Sus comisiones se acumularán automáticamente en su monedero virtual dentro del sistema.
• Para recibir el pago, usted deberá ingresar al sistema y solicitar el retiro de sus comisiones.
• Las solicitudes de retiro deberán realizarse a más tardar los días JUEVES antes de la 1:00 PM (hora centro de México).
• Los pagos de comisiones se procesarán los días VIERNES de cada semana.
• Las solicitudes recibidas después del jueves a la 1:00 PM se procesarán en el ciclo de pago de la siguiente semana.
• Los pagos se realizarán mediante transferencia bancaria a la cuenta registrada en su perfil.

6. REQUISITOS FISCALES

Para el pago de comisiones, se le podrá requerir la emisión de factura (CFDI) correspondiente al monto de sus comisiones. Es responsabilidad del Asesor mantener actualizada su información fiscal en el sistema. EntregaX podrá solicitar su Constancia de Situación Fiscal vigente para efectos de cumplimiento con las obligaciones fiscales aplicables. El incumplimiento en la presentación de facturas podrá resultar en la retención del pago de comisiones hasta que se regularice la situación fiscal.

7. CONFIDENCIALIDAD

El Asesor Comercial se compromete a mantener la confidencialidad de la información de clientes, tarifas, procesos internos y cualquier otra información a la que tenga acceso en el ejercicio de sus funciones. Esta obligación prevalece incluso después de terminada la relación comercial con EntregaX.

8. DERECHOS ARCO

Usted tiene derecho a Acceso, Rectificación, Cancelación y Oposición de sus datos personales. Para ejercer estos derechos, envíe un correo a aldocampos@entregax.com

Última actualización: 25 de Marzo de 2026',
  1,
  true
)
ON CONFLICT (document_type) DO NOTHING;
