-- 0003_audit_ip_ua.sql — add client IP and user-agent to audit log.

ALTER TABLE audit_log ADD COLUMN ip TEXT;
ALTER TABLE audit_log ADD COLUMN user_agent TEXT;
