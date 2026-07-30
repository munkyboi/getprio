INSERT INTO platform_settings (key, value)
VALUES ('default_timezone', 'Asia/Manila')
ON CONFLICT (key) DO NOTHING;
