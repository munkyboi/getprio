INSERT INTO platform_settings (key, value)
VALUES ('max_image_upload_kb', '200')
ON CONFLICT (key) DO NOTHING;
