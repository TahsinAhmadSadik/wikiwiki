-- ============================================================================
-- WikiWiki Database Schema
-- Production-Ready Consolidated DDL Script
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ----------------------------------------------------------------------------
-- 2. ENUM TYPES
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 3. IDENTITY, TAXONOMY & ASSET STORAGE
-- ----------------------------------------------------------------------------
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
    token_version INT DEFAULT 1 NOT NULL,
    has_onboarded BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE categories (
    category_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    parent_category_id INT REFERENCES categories(category_id) ON DELETE SET NULL,
    parent_id INT REFERENCES categories(category_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE media (
    media_id SERIAL PRIMARY KEY,
    media_type media_type_enum NOT NULL,
    file_url TEXT NOT NULL,
    uploader_id INT REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE media_images (
    media_id INT PRIMARY KEY REFERENCES media(media_id) ON DELETE CASCADE,
    width INT,
    height INT,
    alt_text VARCHAR(255)
);

CREATE TABLE media_audio (
    media_id INT PRIMARY KEY REFERENCES media(media_id) ON DELETE CASCADE,
    duration_seconds INT,
    bitrate INT,
    audio_codec VARCHAR(50)
);

CREATE TABLE media_videos (
    media_id INT PRIMARY KEY REFERENCES media(media_id) ON DELETE CASCADE,
    duration_seconds INT,
    resolution VARCHAR(20),
    fps INT
);

-- ----------------------------------------------------------------------------
-- 4. WIKI SPACES & MEMBERSHIPS
-- ----------------------------------------------------------------------------
CREATE TABLE wiki_spaces (
    wiki_id SERIAL PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    slug VARCHAR(150) UNIQUE NOT NULL,
    description TEXT,
    cover_image_url TEXT,
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
    followed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (user_id, category_id)
);

CREATE TABLE wiki_memberships (
    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    wiki_id INT REFERENCES wiki_spaces(wiki_id) ON DELETE CASCADE,
    role wiki_role_enum NOT NULL,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (user_id, wiki_id)
);

CREATE TABLE user_wiki_follows (
    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    wiki_id INT REFERENCES wiki_spaces(wiki_id) ON DELETE CASCADE,
    followed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (user_id, wiki_id)
);

-- ----------------------------------------------------------------------------
-- 5. ARTICLES & VERSION CONTROL
-- ----------------------------------------------------------------------------
CREATE TABLE articles (
    article_id SERIAL PRIMARY KEY,
    wiki_id INT NOT NULL REFERENCES wiki_spaces(wiki_id) ON DELETE CASCADE,
    category_id INT REFERENCES categories(category_id) ON DELETE SET NULL,
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(200) NOT NULL,
    description TEXT DEFAULT '',
    thumbnail_url TEXT,
    is_locked BOOLEAN DEFAULT FALSE NOT NULL,
    is_published BOOLEAN DEFAULT FALSE NOT NULL,
    needs_contribution BOOLEAN DEFAULT FALSE NOT NULL,
    contribution_message TEXT,
    template_type VARCHAR(50) DEFAULT 'standard',
    read_count BIGINT DEFAULT 0 CHECK (read_count >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(wiki_id, slug)
);

CREATE TABLE article_links (
    source_article_id INT REFERENCES articles(article_id) ON DELETE CASCADE,
    target_article_id INT REFERENCES articles(article_id) ON DELETE CASCADE,
    PRIMARY KEY (source_article_id, target_article_id),
    CHECK (source_article_id <> target_article_id)
);

CREATE TABLE article_versions (
    version_id SERIAL PRIMARY KEY,
    article_id INT NOT NULL REFERENCES articles(article_id) ON DELETE CASCADE,
    editor_id INT REFERENCES users(user_id) ON DELETE SET NULL,
    approver_id INT REFERENCES users(user_id) ON DELETE SET NULL,
    version_number INT NOT NULL,
    content JSONB DEFAULT '{}'::jsonb,
    search_vector tsvector,
    edit_summary VARCHAR(255),
    approval_feedback VARCHAR(255),
    is_published BOOLEAN DEFAULT FALSE NOT NULL,
    review_status VARCHAR(30) DEFAULT 'approved',
    rollback_from_version INT,
    rollback_report_id INT, -- Cross-referenced below after reports table creation
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (article_id, version_number)
);

CREATE TABLE article_media (
    article_id INT REFERENCES articles(article_id) ON DELETE CASCADE,
    media_id INT REFERENCES media(media_id) ON DELETE CASCADE,
    PRIMARY KEY (article_id, media_id)
);

-- ----------------------------------------------------------------------------
-- 6. MODERATION, AUDIT LOGGING & USER STUDIO
-- ----------------------------------------------------------------------------
CREATE TABLE reports (
    report_id SERIAL PRIMARY KEY,
    article_id INT NOT NULL REFERENCES articles(article_id) ON DELETE CASCADE,
    version_id INT REFERENCES article_versions(version_id) ON DELETE SET NULL,
    reporter_id INT REFERENCES users(user_id) ON DELETE SET NULL,
    resolver_id INT REFERENCES users(user_id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' NOT NULL,
    demerit_points INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- Add foreign key constraint to link rollback metadata back to reports
ALTER TABLE article_versions
ADD CONSTRAINT fk_article_versions_rollback_report
FOREIGN KEY (rollback_report_id) REFERENCES reports(report_id) ON DELETE SET NULL;

CREATE TABLE article_rollback_logs (
    log_id SERIAL PRIMARY KEY,
    article_id INT NOT NULL REFERENCES articles(article_id) ON DELETE CASCADE,
    user_id INT REFERENCES users(user_id) ON DELETE SET NULL,
    report_id INT REFERENCES reports(report_id) ON DELETE SET NULL,
    prev_version INT NOT NULL,
    new_version INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE reading_lists (
    list_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    is_private BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE reading_list_items (
    item_id SERIAL PRIMARY KEY,
    list_id INT NOT NULL REFERENCES reading_lists(list_id) ON DELETE CASCADE,
    article_id INT NOT NULL REFERENCES articles(article_id) ON DELETE CASCADE,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_reading_list_article UNIQUE (list_id, article_id)
);

-- ----------------------------------------------------------------------------
-- 7. AUTHENTICATION & ONBOARDING INFRASTRUCTURE
-- ----------------------------------------------------------------------------
CREATE TABLE pending_registrations (
    pending_id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE password_resets (
    reset_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ----------------------------------------------------------------------------
-- 8. INDEXES
-- ----------------------------------------------------------------------------
CREATE INDEX idx_pending_registrations_token ON pending_registrations(token_hash);
CREATE INDEX idx_password_resets_token_hash ON password_resets(token_hash);
CREATE INDEX idx_reading_lists_user_id ON reading_lists(user_id);
CREATE INDEX idx_reading_list_items_list_id ON reading_list_items(list_id);
CREATE INDEX idx_reading_list_items_article_id ON reading_list_items(article_id);
CREATE INDEX idx_rollback_logs_article ON article_rollback_logs(article_id, created_at DESC);
CREATE INDEX idx_article_versions_search_vector ON article_versions USING GIN(search_vector);
CREATE INDEX idx_articles_slug ON articles(slug);
CREATE INDEX idx_wiki_spaces_slug ON wiki_spaces(slug);

-- ----------------------------------------------------------------------------
-- 9. TRIGGERS & BUSINESS LOGIC FUNCTIONS
-- ----------------------------------------------------------------------------

-- Trigger 1: Full-Text Search Vector Generator
CREATE OR REPLACE FUNCTION fn_trg_update_article_search_vector()
RETURNS TRIGGER AS $$
DECLARE
    v_title TEXT;
    v_body TEXT := '';
BEGIN
    SELECT title INTO v_title 
    FROM articles 
    WHERE article_id = NEW.article_id;

    SELECT COALESCE(string_agg(COALESCE(elem->'data'->>'text', elem->>'text', ''), ' '), '')
    INTO v_body
    FROM jsonb_array_elements(
        CASE 
            WHEN jsonb_typeof(NEW.content->'blocks') = 'array' THEN NEW.content->'blocks'
            ELSE '[]'::jsonb
        END
    ) AS elem;

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

-- Trigger 2: Automated Rollback Audit Logger
CREATE OR REPLACE FUNCTION fn_trg_log_article_rollback()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_published = TRUE AND NEW.rollback_from_version IS NOT NULL THEN
        INSERT INTO article_rollback_logs (
            article_id,
            user_id,
            report_id,
            prev_version,
            new_version,
            created_at
        ) VALUES (
            NEW.article_id,
            NEW.approver_id,
            NEW.rollback_report_id,
            NEW.rollback_from_version,
            NEW.version_number,
            CURRENT_TIMESTAMP
        );

        NEW.rollback_from_version := NULL;
        NEW.rollback_report_id := NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_article_versions_rollback ON article_versions;
CREATE TRIGGER trg_article_versions_rollback
BEFORE UPDATE OF is_published ON article_versions
FOR EACH ROW
EXECUTE FUNCTION fn_trg_log_article_rollback();

-- ----------------------------------------------------------------------------
-- 10. STORED PROCEDURES & ANALYTICS FUNCTIONS
-- ----------------------------------------------------------------------------

-- Analytics UDF: Recursive Common Table Expression for Category Tree Traversal
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
        SELECT c.category_id
        FROM categories c
        WHERE c.category_id = p_category_id
        
        UNION ALL
        
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
    INNER JOIN categories cat ON COALESCE(a.category_id, w.category_id) = cat.category_id
    WHERE a.is_published = TRUE
      AND COALESCE(a.category_id, w.category_id) IN (SELECT ct.category_id FROM category_tree ct)
      AND (p_days <= 0 OR a.created_at >= (CURRENT_TIMESTAMP - (p_days || ' days')::INTERVAL))
    ORDER BY a.read_count DESC, a.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Stored Procedure: Atomic Moderation Resolution, Auto-Banning & Version Rollback
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
    v_prev_version INT;
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

    -- Fallback: locate latest editor if reported at article level
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

    -- 4. Execute atomic version rollback workflow with trigger logging
    IF p_rollback_version_id IS NOT NULL AND v_article_id IS NOT NULL THEN
        SELECT COALESCE(version_number, 1) INTO v_prev_version
        FROM article_versions
        WHERE article_id = v_article_id AND is_published = TRUE
        LIMIT 1;

        UPDATE article_versions
        SET is_published = FALSE
        WHERE article_id = v_article_id;

        UPDATE article_versions
        SET is_published = TRUE,
            review_status = 'approved',
            approver_id = p_resolver_id,
            rollback_from_version = COALESCE(v_prev_version, 1),
            rollback_report_id = p_report_id
        WHERE version_id = p_rollback_version_id
          AND article_id = v_article_id;

        UPDATE articles
        SET is_published = TRUE
        WHERE article_id = v_article_id;
    END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 11. INITIAL SEED / PERMISSIONS SETUP
-- ----------------------------------------------------------------------------
UPDATE users 
SET global_role = 'owner' 
WHERE email = 'tahsinahmadsadik@gmail.com';