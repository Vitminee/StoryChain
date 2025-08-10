-- Remove foreign key constraints that are causing issues with our WebSocket-based user system
ALTER TABLE changes DROP CONSTRAINT IF EXISTS changes_user_id_fkey;
ALTER TABLE user_cooldowns DROP CONSTRAINT IF EXISTS user_cooldowns_user_id_fkey;