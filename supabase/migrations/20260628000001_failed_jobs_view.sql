-- View for spotting dead-lettered jobs that failed after exhausting retries.
-- Query: SELECT * FROM failed_jobs ORDER BY last_attempt DESC;
CREATE OR REPLACE VIEW failed_jobs AS
SELECT
  id,
  type,
  payload,
  attempts,
  max_attempts,
  error,
  created_at,
  updated_at AS last_attempt
FROM job_queue
WHERE status = 'failed'
ORDER BY updated_at DESC;
