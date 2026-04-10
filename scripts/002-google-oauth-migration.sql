-- Google OAuth 마이그레이션
-- 실행 전 users 테이블 백업 권장: CREATE TABLE users_backup AS SELECT * FROM users;
-- 실행: mysql -u <user> -p <database> < scripts/002-google-oauth-migration.sql

-- 1. user_sessions 테이블 생성
CREATE TABLE IF NOT EXISTS user_sessions (
  id VARCHAR(36) PRIMARY KEY,
  user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  KEY `user_id` (`user_id`),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 2. users 테이블 변경
ALTER TABLE users
  ADD COLUMN google_id VARCHAR(255) NULL AFTER email,
  ADD COLUMN name VARCHAR(255) NULL AFTER google_id,
  ADD COLUMN picture VARCHAR(500) NULL AFTER name;

ALTER TABLE users DROP COLUMN password;
ALTER TABLE users DROP COLUMN is_verified;

-- 3. email_verifications 테이블 제거
DROP TABLE IF EXISTS email_verifications;
