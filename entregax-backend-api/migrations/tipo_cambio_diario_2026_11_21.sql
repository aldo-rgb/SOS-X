-- El tipo de cambio de cada dia, para poder cotizar con el del dia en que la
-- guia se recibio en China y no con el de hoy. exchange_rate_history solo
-- guarda cuando alguien edita la configuracion a mano: tiene 27 filas y la
-- ultima es de junio.
CREATE TABLE IF NOT EXISTS tipo_cambio_diario (
  fecha        DATE         NOT NULL,
  servicio     VARCHAR(40)  NOT NULL,
  tc_api       NUMERIC(10,4),
  sobreprecio  NUMERIC(10,4),
  tc_final     NUMERIC(10,4) NOT NULL,
  fuente       VARCHAR(20)  NOT NULL DEFAULT 'cron',
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (fecha, servicio)
);

CREATE INDEX IF NOT EXISTS idx_tc_diario_servicio_fecha
  ON tipo_cambio_diario (servicio, fecha DESC);
