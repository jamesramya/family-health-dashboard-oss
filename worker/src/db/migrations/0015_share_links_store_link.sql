-- Store the raw share link path so it can be displayed and copied from the active links list.
ALTER TABLE share_links ADD COLUMN link TEXT;
