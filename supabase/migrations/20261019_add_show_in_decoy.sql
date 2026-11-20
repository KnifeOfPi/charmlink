-- Add show_in_decoy toggle to charmLink_links.
-- When true, a social link IS rendered on the decoy page that bots see.
-- Default false: creators opt in per-link via the admin dashboard.
ALTER TABLE charmlink_links
ADD COLUMN IF NOT EXISTS show_in_decoy BOOLEAN DEFAULT false;