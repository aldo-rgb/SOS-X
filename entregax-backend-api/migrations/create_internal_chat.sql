-- =====================================================================
-- Chat interno entre staff (admin / operativos / repartidores / asesores)
-- =====================================================================

-- Conversaciones (1-a-1 o grupo)
CREATE TABLE IF NOT EXISTS chat_conversations (
  id BIGSERIAL PRIMARY KEY,
  type VARCHAR(20) NOT NULL CHECK (type IN ('direct', 'group')),
  title VARCHAR(255),                         -- nombre del grupo (NULL en directos)
  description TEXT,
  avatar_url TEXT,
  branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  auto_group_key VARCHAR(100) UNIQUE,         -- ej: 'branch:5', 'role:repartidor', 'role:asesor'
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMP,
  last_message_preview TEXT
);

CREATE INDEX IF NOT EXISTS idx_chat_conv_branch ON chat_conversations(branch_id);
CREATE INDEX IF NOT EXISTS idx_chat_conv_last_message ON chat_conversations(last_message_at DESC);

-- Participantes
CREATE TABLE IF NOT EXISTS chat_participants (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  is_muted BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  left_at TIMESTAMP,
  last_read_message_id BIGINT,
  UNIQUE (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_part_user ON chat_participants(user_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_chat_part_conv ON chat_participants(conversation_id) WHERE left_at IS NULL;

-- Mensajes
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  body TEXT,                                   -- texto del mensaje
  message_type VARCHAR(20) NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'image', 'file', 'audio', 'video', 'system')),
  reply_to_id BIGINT REFERENCES chat_messages(id) ON DELETE SET NULL,
  edited_at TIMESTAMP,
  deleted_at TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_msg_conv_created ON chat_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_msg_sender ON chat_messages(sender_id);

-- Adjuntos (S3)
CREATE TABLE IF NOT EXISTS chat_message_attachments (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  s3_key TEXT NOT NULL,
  file_name VARCHAR(255),
  mime_type VARCHAR(120),
  size_bytes BIGINT,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_attach_message ON chat_message_attachments(message_id);

-- Recibos de lectura (opcional, granular)
CREATE TABLE IF NOT EXISTS chat_message_reads (
  message_id BIGINT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

-- Tokens push FCM (un usuario puede tener varios dispositivos)
CREATE TABLE IF NOT EXISTS user_push_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  device_id VARCHAR(120),
  device_name VARCHAR(120),
  app_version VARCHAR(50),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_push_user ON user_push_tokens(user_id) WHERE is_active = TRUE;

-- Trigger para mantener last_message_at / last_message_preview en la conversación
CREATE OR REPLACE FUNCTION chat_update_conv_last_message() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deleted_at IS NULL THEN
    UPDATE chat_conversations
       SET last_message_at = NEW.created_at,
           last_message_preview = LEFT(COALESCE(NEW.body, '[adjunto]'), 200),
           updated_at = NOW()
     WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chat_update_conv_last_message ON chat_messages;
CREATE TRIGGER trg_chat_update_conv_last_message
AFTER INSERT ON chat_messages
FOR EACH ROW EXECUTE FUNCTION chat_update_conv_last_message();
