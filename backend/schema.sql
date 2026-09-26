CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE TYPE global_role_enum AS ENUM (
    'guest',
    'contributor',
    'admin',
    'owner'
);

CREATE TYPE wiki_role_enum AS ENUM (
    'author',
    'co_author'
);

CREATE TYPE media_type_enum AS ENUM (
    'image',
    'audio',
    'video'
);

CREATE TYPE report_status_enum AS ENUM (
    'pending',
    'resolved',
    'dismissed'
);


CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    global_role global_role_enum DEFAULT 'contributor' NOT NULL,
    is_banned BOOLEAN DEFAULT FALSE NOT NULL,
    demerit_points INT DEFAULT 0 CHECK (demerit_points >= 0),
    profile_pic_url TEXT,
    bio TEXT,
    theme_preference VARCHAR(30) DEFAULT 'default',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);





CREATE TABLE categories (
    category_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    parent_category_id INT
        REFERENCES categories(category_id)
        ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE
        DEFAULT CURRENT_TIMESTAMP NOT NULL
);



CREATE TABLE media (
    media_id SERIAL PRIMARY KEY,
    media_type media_type_enum NOT NULL,
    file_url TEXT NOT NULL,
    uploader_id INT
        REFERENCES users(user_id)
        ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE
        DEFAULT CURRENT_TIMESTAMP NOT NULL
);




CREATE TABLE media_images (
    media_id INT PRIMARY KEY
        REFERENCES media(media_id)
        ON DELETE CASCADE,
    width INT,
    height INT,
    alt_text VARCHAR(255)
);
CREATE TABLE media_audio (
    media_id INT PRIMARY KEY
        REFERENCES media(media_id)
        ON DELETE CASCADE,
    duration_seconds INT,
    bitrate INT,
    audio_codec VARCHAR(50)
);

CREATE TABLE media_videos (
    media_id INT PRIMARY KEY
        REFERENCES media(media_id)
        ON DELETE CASCADE,
    duration_seconds INT,
    resolution VARCHAR(20),
    fps INT
);






CREATE TABLE wiki_spaces (
    wiki_id SERIAL PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    slug VARCHAR(150) UNIQUE NOT NULL,
    description TEXT,
    media_id INT REFERENCES media(media_id) ON DELETE SET NULL,
    template_config JSONB DEFAULT '{}'::jsonb,
    creator_id INT REFERENCES users(user_id) ON DELETE SET NULL,
    category_id INT REFERENCES categories(category_id) ON DELETE RESTRICT,
    total_views BIGINT DEFAULT 0 CHECK (total_views >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);



CREATE TABLE user_category_follows (
    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    category_id INT REFERENCES categories(category_id) ON DELETE CASCADE,
    followed_at TIMESTAMP WITH TIME ZONE
        DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (user_id, category_id)
);

CREATE TABLE wiki_memberships (
    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    wiki_id INT REFERENCES wiki_spaces(wiki_id) ON DELETE CASCADE,
    role wiki_role_enum NOT NULL,
    assigned_at TIMESTAMP WITH TIME ZONE
        DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (user_id, wiki_id)
);

CREATE TABLE user_wiki_follows (
    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    wiki_id INT REFERENCES wiki_spaces(wiki_id) ON DELETE CASCADE,
    followed_at TIMESTAMP WITH TIME ZONE
        DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (user_id, wiki_id)
);



CREATE TABLE articles (
    article_id SERIAL PRIMARY KEY,
    wiki_id INT NOT NULL
        REFERENCES wiki_spaces(wiki_id) ON DELETE CASCADE,
    category_id INT
        REFERENCES categories(category_id) ON DELETE SET NULL,
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(200) NOT NULL,
    is_locked BOOLEAN DEFAULT FALSE NOT NULL,
    is_published BOOLEAN DEFAULT FALSE NOT NULL,
    template_type VARCHAR(50) DEFAULT 'standard',
    read_count BIGINT DEFAULT 0 CHECK (read_count >= 0),
    created_at TIMESTAMP WITH TIME ZONE
        DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(wiki_id, slug)
);

CREATE TABLE article_links (
    source_article_id INT
        REFERENCES articles(article_id) ON DELETE CASCADE,
    target_article_id INT
        REFERENCES articles(article_id) ON DELETE CASCADE,
    PRIMARY KEY (source_article_id, target_article_id),
    CHECK (source_article_id <> target_article_id)
);

CREATE TABLE article_versions (
    version_id SERIAL PRIMARY KEY,
    article_id INT NOT NULL
        REFERENCES articles(article_id) ON DELETE CASCADE,
    editor_id INT
        REFERENCES users(user_id) ON DELETE SET NULL,
    approver_id INT
        REFERENCES users(user_id) ON DELETE SET NULL,
    version_number INT NOT NULL,
    content JSONB DEFAULT '{}'::jsonb,
    search_vector tsvector,
    edit_summary VARCHAR(255),
    approval_feedback VARCHAR(255),
    is_published BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE
        DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (article_id, version_number)
);





CREATE TABLE article_media (
    article_id INT
        REFERENCES articles(article_id) ON DELETE CASCADE,
    media_id INT
        REFERENCES media(media_id) ON DELETE CASCADE,
    PRIMARY KEY (article_id, media_id)
);



CREATE TABLE reading_lists (
    list_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL
        REFERENCES users(user_id) ON DELETE CASCADE,
    title VARCHAR(100) NOT NULL,
    is_public BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE
        DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE reading_list_items (
    list_id INT
        REFERENCES reading_lists(list_id) ON DELETE CASCADE,
    article_id INT
        REFERENCES articles(article_id) ON DELETE CASCADE,
    added_at TIMESTAMP WITH TIME ZONE
        DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (list_id, article_id)
);



CREATE TABLE reports (
    report_id SERIAL PRIMARY KEY,
    article_id INT NOT NULL
        REFERENCES articles(article_id) ON DELETE CASCADE,
    version_id INT
        REFERENCES article_versions(version_id) ON DELETE SET NULL,
    reporter_id INT
        REFERENCES users(user_id) ON DELETE SET NULL,
    resolver_id INT
        REFERENCES users(user_id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    status report_status_enum
        DEFAULT 'pending' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE
        DEFAULT CURRENT_TIMESTAMP NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE
);



ALTER TABLE articles 
ADD COLUMN needs_contribution BOOLEAN DEFAULT FALSE NOT NULL,
ADD COLUMN contribution_message TEXT;




ALTER TABLE users ADD COLUMN token_version INT DEFAULT 1 NOT NULL;











CREATE TABLE password_resets (
    reset_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_password_resets_token_hash ON password_resets(token_hash);









CREATE TABLE pending_registrations (
    pending_id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_pending_registrations_token ON pending_registrations(token_hash);





ALTER TABLE users ADD COLUMN has_onboarded BOOLEAN DEFAULT FALSE NOT NULL;





--  default owner
UPDATE users SET global_role = 'owner' WHERE email = 'tahsinahmadsadik@gmail.com';



-- ============================================================================
-- 1. TRIGGER: Automatic Full-Text Search Vector Generator
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_trg_update_article_search_vector()
RETURNS TRIGGER AS $$
DECLARE
    v_title TEXT;
    v_body TEXT := '';
BEGIN
    -- Retrieve parent article title
    SELECT title INTO v_title 
    FROM articles 
    WHERE article_id = NEW.article_id;

    -- Extract text strings from JSONB block array
    SELECT COALESCE(string_agg(COALESCE(elem->'data'->>'text', elem->>'text', ''), ' '), '')
    INTO v_body
    FROM jsonb_array_elements(
        CASE 
            WHEN jsonb_typeof(NEW.content->'blocks') = 'array' THEN NEW.content->'blocks'
            ELSE '[]'::jsonb
        END
    ) AS elem;

    -- Combine Title (Weight A) and Body Content (Weight B) into tsvector
    NEW.search_vector := 
        setweight(to_tsvector('english', COALESCE(v_title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(v_body, '')), 'B');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_article_versions_search_vector ON article_versions;

CREATE TRIGGER trg_article_versions_search_vector
BEFORE INSERT OR UPDATE OF content ON article_versions
FOR EACH ROW
EXECUTE FUNCTION fn_trg_update_article_search_vector();


-- ============================================================================
-- 2. STORED PROCEDURE: Resolve Report & Penalize Contributor
-- ============================================================================
CREATE OR REPLACE PROCEDURE sp_resolve_report_and_penalize(
    p_report_id INT,
    p_resolver_id INT,
    p_action VARCHAR,
    p_demerit_points INT DEFAULT 0
)
AS $$
DECLARE
    v_target_user_id INT;
    v_new_demerits INT;
BEGIN
    -- 1. Verify and update the report status
    UPDATE reports
    SET status = p_action::report_status_enum,
        resolver_id = p_resolver_id,
        resolved_at = CURRENT_TIMESTAMP
    WHERE report_id = p_report_id;

    -- 2. Identify the editor associated with the reported version or article
    SELECT av.editor_id INTO v_target_user_id
    FROM reports r
    LEFT JOIN article_versions av ON r.version_id = av.version_id
    WHERE r.report_id = p_report_id;

    -- Fallback to article creator if version editor is null
    IF v_target_user_id IS NULL THEN
        SELECT a.wiki_id INTO v_target_user_id 
        FROM reports r 
        INNER JOIN articles a ON r.article_id = a.article_id 
        WHERE r.report_id = p_report_id;
    END IF;

    -- 3. Apply demerit points and check ban threshold
    IF p_demerit_points > 0 AND v_target_user_id IS NOT NULL THEN
        UPDATE users
        SET demerit_points = demerit_points + p_demerit_points
        WHERE user_id = v_target_user_id
        RETURNING demerit_points INTO v_new_demerits;

        -- Auto-ban policy: demerits >= 5 triggers ban and session revocation
        IF v_new_demerits >= 5 THEN
            UPDATE users
            SET is_banned = TRUE,
                token_version = token_version + 1
            WHERE user_id = v_target_user_id;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 3. FUNCTION (UDF): Time-Windowed & Category Subtree Article Ranking
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_get_top_articles_by_time_and_topic(
    p_category_id INT,
    p_days INT,
    p_limit INT
)
RETURNS TABLE (
    article_id INT,
    title VARCHAR,
    slug VARCHAR,
    wiki_title VARCHAR,
    wiki_slug VARCHAR,
    category_name VARCHAR,
    read_count INT,
    published_version INT,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE category_tree AS (
        -- Root selection
        SELECT c.category_id
        FROM categories c
        WHERE c.category_id = p_category_id
        
        UNION ALL
        
        -- Recursive descent into child categories
        SELECT c_child.category_id
        FROM categories c_child
        INNER JOIN category_tree ct ON c_child.parent_category_id = ct.category_id
    )
    SELECT 
        a.article_id::INT,
        a.title,
        a.slug,
        w.title AS wiki_title,
        w.slug AS wiki_slug,
        cat.name AS category_name,
        a.read_count::INT,
        (
            SELECT COALESCE(MAX(av.version_number), 1)::INT 
            FROM article_versions av 
            WHERE av.article_id = a.article_id AND av.is_published = TRUE
        ) AS published_version,
        a.created_at
    FROM articles a
    INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
    INNER JOIN categories cat ON a.category_id = cat.category_id
    WHERE a.is_published = TRUE
      AND a.category_id IN (SELECT ct.category_id FROM category_tree ct)
      AND (p_days <= 0 OR a.created_at >= (CURRENT_TIMESTAMP - (p_days || ' days')::INTERVAL))
    ORDER BY a.read_count DESC, a.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;








-- 1. Ensure resolution audit columns exist on reports
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolver_id INT REFERENCES users(user_id);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE;

-- 2. Ensure demerit_points defaults to 0 on users
ALTER TABLE users ALTER COLUMN demerit_points SET DEFAULT 0;
UPDATE users SET demerit_points = 0 WHERE demerit_points IS NULL;




-- 3. Replace the stored procedure with type-safe assignments
CREATE OR REPLACE PROCEDURE sp_resolve_report_and_penalize(
    p_report_id INT,
    p_resolver_id INT,
    p_action VARCHAR,
    p_demerit_points INT DEFAULT 0
)
AS $$
DECLARE
    v_target_user_id INT;
    v_new_demerits INT;
BEGIN
    -- 1. Update report status without rigid enum cast (compatible with VARCHAR and ENUM)
    UPDATE reports
    SET status = p_action,
        resolver_id = p_resolver_id,
        resolved_at = CURRENT_TIMESTAMP
    WHERE report_id = p_report_id;

    -- 2. Locate editor of the flagged version
    SELECT av.editor_id INTO v_target_user_id
    FROM reports r
    LEFT JOIN article_versions av ON r.version_id = av.version_id
    WHERE r.report_id = p_report_id;

    -- Fallback: If reported at article level, find the latest version's author
    IF v_target_user_id IS NULL THEN
        SELECT av.editor_id INTO v_target_user_id
        FROM reports r
        INNER JOIN article_versions av ON r.article_id = av.article_id
        WHERE r.report_id = p_report_id
        ORDER BY av.version_number DESC
        LIMIT 1;
    END IF;

    -- 3. Apply demerits if points > 0 and user exists
    IF p_demerit_points > 0 AND v_target_user_id IS NOT NULL THEN
        UPDATE users
        SET demerit_points = COALESCE(demerit_points, 0) + p_demerit_points
        WHERE user_id = v_target_user_id
        RETURNING demerit_points INTO v_new_demerits;

        -- Auto-ban policy: demerits >= 5 revokes sessions and bans user
        IF v_new_demerits >= 5 THEN
            UPDATE users
            SET is_banned = TRUE,
                token_version = token_version + 1
            WHERE user_id = v_target_user_id;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;






-- 1. Ensure resolution audit columns exist on reports
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolver_id INT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE;

-- 2. Convert status column to VARCHAR to eliminate enum casting conflicts
ALTER TABLE reports ALTER COLUMN status TYPE VARCHAR(50);

-- 3. Ensure users table has demerit_points initialized
ALTER TABLE users ADD COLUMN IF NOT EXISTS demerit_points INT DEFAULT 0;
UPDATE users SET demerit_points = 0 WHERE demerit_points IS NULL;

-- 4. Clean up any previous procedure overloads
DROP PROCEDURE IF EXISTS sp_resolve_report_and_penalize(INT, INT, VARCHAR, INT);
DROP PROCEDURE IF EXISTS sp_resolve_report_and_penalize(INT, INT, VARCHAR);
DROP PROCEDURE IF EXISTS sp_resolve_report_and_penalize(INT, INT, TEXT, INT);
DROP PROCEDURE IF EXISTS sp_resolve_report_and_penalize(INT, INT, TEXT);
DROP PROCEDURE IF EXISTS sp_resolve_report_and_penalize;

-- 5. Create the procedure matching Prisma's (BIGINT, BIGINT, TEXT, BIGINT) parameter types
CREATE OR REPLACE PROCEDURE sp_resolve_report_and_penalize(
    p_report_id BIGINT,
    p_resolver_id BIGINT,
    p_action TEXT,
    p_demerit_points BIGINT DEFAULT 0
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_target_user_id BIGINT;
    v_new_demerits BIGINT;
BEGIN
    -- 1. Update report resolution status and audit details
    UPDATE reports
    SET status = p_action,
        resolver_id = p_resolver_id,
        resolved_at = CURRENT_TIMESTAMP
    WHERE report_id = p_report_id;

    -- 2. Locate editor of the flagged version
    SELECT av.editor_id INTO v_target_user_id
    FROM reports r
    LEFT JOIN article_versions av ON r.version_id = av.version_id
    WHERE r.report_id = p_report_id;

    -- Fallback: If reported at article level, find the latest version's author
    IF v_target_user_id IS NULL THEN
        SELECT av.editor_id INTO v_target_user_id
        FROM reports r
        INNER JOIN article_versions av ON r.article_id = av.article_id
        WHERE r.report_id = p_report_id
        ORDER BY av.version_number DESC
        LIMIT 1;
    END IF;

    -- 3. Apply demerits if points > 0 and editor exists
    IF p_demerit_points > 0 AND v_target_user_id IS NOT NULL THEN
        UPDATE users
        SET demerit_points = COALESCE(demerit_points, 0) + p_demerit_points
        WHERE user_id = v_target_user_id
        RETURNING demerit_points INTO v_new_demerits;

        -- Auto-ban policy: demerits >= 5 revokes sessions and bans user
        IF v_new_demerits >= 5 THEN
            UPDATE users
            SET is_banned = TRUE,
                token_version = token_version + 1
            WHERE user_id = v_target_user_id;
        END IF;
    END IF;
END;
$$;





-- 1. Add demerit_points column to reports
ALTER TABLE reports ADD COLUMN IF NOT EXISTS demerit_points INT DEFAULT 0;

-- 2. Update procedure to record the demerits on the resolved report
CREATE OR REPLACE PROCEDURE sp_resolve_report_and_penalize(
    p_report_id BIGINT,
    p_resolver_id BIGINT,
    p_action TEXT,
    p_demerit_points BIGINT DEFAULT 0
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_target_user_id BIGINT;
    v_new_demerits BIGINT;
BEGIN
    -- 1. Update report resolution status, audit details, and demerits recorded
    UPDATE reports
    SET status = p_action,
        resolver_id = p_resolver_id,
        resolved_at = CURRENT_TIMESTAMP,
        demerit_points = p_demerit_points::INT
    WHERE report_id = p_report_id;

    -- 2. Locate editor of the flagged version
    SELECT av.editor_id INTO v_target_user_id
    FROM reports r
    LEFT JOIN article_versions av ON r.version_id = av.version_id
    WHERE r.report_id = p_report_id;

    -- Fallback: If reported at article level, find the latest version's author
    IF v_target_user_id IS NULL THEN
        SELECT av.editor_id INTO v_target_user_id
        FROM reports r
        INNER JOIN article_versions av ON r.article_id = av.article_id
        WHERE r.report_id = p_report_id
        ORDER BY av.version_number DESC
        LIMIT 1;
    END IF;

    -- 3. Apply demerits if points > 0 and editor exists
    IF p_demerit_points > 0 AND v_target_user_id IS NOT NULL THEN
        UPDATE users
        SET demerit_points = COALESCE(demerit_points, 0) + p_demerit_points
        WHERE user_id = v_target_user_id
        RETURNING demerit_points INTO v_new_demerits;

        -- Auto-ban policy: demerits >= 5 revokes sessions and bans user
        IF v_new_demerits >= 5 THEN
            UPDATE users
            SET is_banned = TRUE,
                token_version = token_version + 1
            WHERE user_id = v_target_user_id;
        END IF;
    END IF;
END;
$$;








-- 1. Create reading_lists table
CREATE TABLE IF NOT EXISTS reading_lists (
    list_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    is_private BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create reading_list_items junction table
CREATE TABLE IF NOT EXISTS reading_list_items (
    item_id SERIAL PRIMARY KEY,
    list_id INT NOT NULL REFERENCES reading_lists(list_id) ON DELETE CASCADE,
    article_id INT NOT NULL REFERENCES articles(article_id) ON DELETE CASCADE,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_reading_list_article UNIQUE (list_id, article_id)
);

-- 3. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_reading_lists_user_id ON reading_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_reading_list_items_list_id ON reading_list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_reading_list_items_article_id ON reading_list_items(article_id);




ALTER TABLE reading_lists ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE reading_lists ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT TRUE;





-- 1. Add description column to articles
ALTER TABLE articles ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';




ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id INT REFERENCES categories(category_id) ON DELETE SET NULL;






-- 1. Add cover image column to wiki_spaces
ALTER TABLE wiki_spaces 
ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

-- 2. Add thumbnail image column to articles
ALTER TABLE articles 
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;






















-- Drop previous signatures to avoid overload conflicts
DROP FUNCTION IF EXISTS fn_get_top_articles_by_time_and_topic(INT, INT, INT);
DROP FUNCTION IF EXISTS fn_get_top_articles_by_time_and_topic(BIGINT, BIGINT, BIGINT);

CREATE OR REPLACE FUNCTION fn_get_top_articles_by_time_and_topic(
    p_category_id BIGINT,
    p_days BIGINT,
    p_limit BIGINT
)
RETURNS TABLE (
    article_id INT,
    title VARCHAR,
    slug VARCHAR,
    wiki_title VARCHAR,
    wiki_slug VARCHAR,
    category_name VARCHAR,
    read_count INT,
    published_version INT,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE category_tree AS (
        -- 1. Root category selection
        SELECT c.category_id
        FROM categories c
        WHERE c.category_id = p_category_id
        
        UNION ALL
        
        -- 2. Recursive descent matching either parent_id or parent_category_id
        SELECT c_child.category_id
        FROM categories c_child
        INNER JOIN category_tree ct ON COALESCE(c_child.parent_id, c_child.parent_category_id) = ct.category_id
    )
    SELECT 
        a.article_id::INT,
        a.title,
        a.slug,
        w.title AS wiki_title,
        w.slug AS wiki_slug,
        cat.name AS category_name,
        a.read_count::INT,
        (
            SELECT COALESCE(MAX(av.version_number), 1)::INT 
            FROM article_versions av 
            WHERE av.article_id = a.article_id AND av.is_published = TRUE
        ) AS published_version,
        a.created_at
    FROM articles a
    INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
    -- Fall back to parent wiki category if article category_id is NULL
    INNER JOIN categories cat ON COALESCE(a.category_id, w.category_id) = cat.category_id
    WHERE a.is_published = TRUE
      AND COALESCE(a.category_id, w.category_id) IN (SELECT ct.category_id FROM category_tree ct)
      AND (p_days <= 0 OR a.created_at >= (CURRENT_TIMESTAMP - (p_days || ' days')::INTERVAL))
    ORDER BY a.read_count DESC, a.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;









DROP PROCEDURE IF EXISTS sp_resolve_report_and_penalize(BIGINT, BIGINT, TEXT, BIGINT);
DROP PROCEDURE IF EXISTS sp_resolve_report_and_penalize(BIGINT, BIGINT, TEXT, BIGINT, BIGINT);

CREATE OR REPLACE PROCEDURE sp_resolve_report_and_penalize(
    p_report_id BIGINT,
    p_resolver_id BIGINT,
    p_action TEXT,
    p_demerit_points BIGINT DEFAULT 0,
    p_rollback_version_id BIGINT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_target_user_id BIGINT;
    v_new_demerits BIGINT;
    v_article_id BIGINT;
BEGIN
    -- 1. Update report resolution status, audit details, and demerits recorded
    UPDATE reports
    SET status = p_action,
        resolver_id = p_resolver_id,
        resolved_at = CURRENT_TIMESTAMP,
        demerit_points = p_demerit_points::INT
    WHERE report_id = p_report_id
    RETURNING article_id INTO v_article_id;

    -- 2. Locate editor of the flagged version
    SELECT av.editor_id INTO v_target_user_id
    FROM reports r
    LEFT JOIN article_versions av ON r.version_id = av.version_id
    WHERE r.report_id = p_report_id;

    -- Fallback: If reported at article level, find the latest version's author
    IF v_target_user_id IS NULL THEN
        SELECT av.editor_id INTO v_target_user_id
        FROM reports r
        INNER JOIN article_versions av ON r.article_id = av.article_id
        WHERE r.report_id = p_report_id
        ORDER BY av.version_number DESC
        LIMIT 1;
    END IF;

    -- 3. Apply demerits if points > 0 and editor exists
    IF p_demerit_points > 0 AND v_target_user_id IS NOT NULL THEN
        UPDATE users
        SET demerit_points = COALESCE(demerit_points, 0) + p_demerit_points
        WHERE user_id = v_target_user_id
        RETURNING demerit_points INTO v_new_demerits;

        -- Auto-ban policy: demerits >= 5 revokes sessions and bans user
        IF v_new_demerits >= 5 THEN
            UPDATE users
            SET is_banned = TRUE,
                token_version = token_version + 1
            WHERE user_id = v_target_user_id;
        END IF;
    END IF;

    -- 4. Optional Version Rollback Workflow
    IF p_rollback_version_id IS NOT NULL AND v_article_id IS NOT NULL THEN
        -- Mark all versions of this article as inactive
        UPDATE article_versions
        SET is_published = FALSE
        WHERE article_id = v_article_id;

        -- Activate the designated target version
        UPDATE article_versions
        SET is_published = TRUE
        WHERE version_id = p_rollback_version_id
          AND article_id = v_article_id;

        -- Ensure parent article reflects published status
        UPDATE articles
        SET is_published = TRUE
        WHERE article_id = v_article_id;
    END IF;
END;
$$;






-- 1. Add review_status column to article_versions
ALTER TABLE article_versions 
ADD COLUMN IF NOT EXISTS review_status VARCHAR(30) DEFAULT 'approved';

-- 2. Backfill: Set genuinely unreviewed drafts to 'pending'
-- (Drafts that have never been published and have no approver_id)
UPDATE article_versions
SET review_status = 'pending'
WHERE is_published = FALSE AND approver_id IS NULL;

-- 3. Ensure all previously published or approved versions are marked 'approved'
UPDATE article_versions
SET review_status = 'approved'
WHERE is_published = TRUE OR approver_id IS NOT NULL;