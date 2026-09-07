UPDATE users
SET roles = ARRAY(
  SELECT DISTINCT role
  FROM unnest(COALESCE(users.roles, ARRAY[]::TEXT[]) || ARRAY['platform_admin']::TEXT[]) AS role
)
WHERE lower(email) = lower('carlo.abella@gmail.com');
