WITH missing_usernames AS (
  SELECT
    id,
    CASE
      WHEN LENGTH(TRIM(BOTH '_' FROM REGEXP_REPLACE(LOWER(TRIM(name)), '[^a-z0-9]+', '_', 'g'))) >= 3
        THEN TRIM(BOTH '_' FROM REGEXP_REPLACE(LOWER(TRIM(name)), '[^a-z0-9]+', '_', 'g'))
      ELSE 'user_' || id::TEXT
    END AS base_username
  FROM users
  WHERE username IS NULL OR username = ''
)
UPDATE users
SET username = LEFT(base_username, GREATEST(1, 30 - LENGTH('_' || missing_usernames.id::TEXT))) || '_' || missing_usernames.id::TEXT
FROM missing_usernames
WHERE users.id = missing_usernames.id;
