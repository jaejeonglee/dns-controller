-- DNS 레코드 유효성 검증을 위한 컬럼 추가
-- 실행: mysql -u <user> -p <database> < scripts/001-add-validation-columns.sql

ALTER TABLE subdomains
  ADD COLUMN warning_count    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN last_warning_at  DATETIME         NULL DEFAULT NULL,
  ADD COLUMN last_checked_at  DATETIME         NULL DEFAULT NULL;
