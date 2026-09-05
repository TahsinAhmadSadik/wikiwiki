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