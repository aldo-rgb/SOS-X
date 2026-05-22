-- Secuencia para generación atómica de box_id (evita duplicados en registro concurrente)
-- Arranca en S3361. Los números ya ocupados (ej. S4000–S4040) se saltan automáticamente
-- en el código al verificar existencia antes de asignar.
CREATE SEQUENCE IF NOT EXISTS box_id_seq
  START WITH 3361
  INCREMENT BY 1
  NO MAXVALUE
  NO CYCLE;
