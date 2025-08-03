DROP TABLE IF EXISTS users;
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    username TEXT NOT NULL UNIQUE, 
    lowercase_username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_changed_at TEXT,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL, 
    last_login TEXT, 

    about_me TEXT, 
    display_name TEXT,
    view_count INTEGER DEFAULT 0,
    pfp_url TEXT, 
    signature TEXT, 
    location TEXT, 
    social_links TEXT, 
    fav_articles TEXT,
    music TEXT,
    style TEXT
);

DROP TABLE IF EXISTS follows;
CREATE TABLE IF NOT EXISTS follows (
    follower TEXT NOT NULL,
    following TEXT NOT NULL,
    PRIMARY KEY (follower, following),
    FOREIGN KEY (follower) REFERENCES users(username),
    FOREIGN KEY (following) REFERENCES users(username)
);

DROP TABLE IF EXISTS articles;
CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT DEFAULT 'Anonymous',
    subject TEXT DEFAULT 'Other' CHECK (subject IN ('Other', 'Technology', 'Gaming', 'Food', 'Animals', 'Websites', 'Music', 'Bands', 'Software', 'Souple', 'Biography', 'Science', 'Geography', 'History', 'Literature', 'Media', 'Sports & Recreation', 'Art & Design', 'Astronomy', 'Chemistry', 'Computer Science', 'Education', 'Film')),
    content TEXT NOT NULL,
    creation_date TEXT NOT NULL,
    last_modified TEXT NOT NULL,
    view_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    featured INTEGER DEFAULT 0,
    favorites INTEGER DEFAULT 0
);

DROP TABLE IF EXISTS edit_history;
CREATE TABLE IF NOT EXISTS edit_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id INTEGER NOT NULL,
    editor TEXT NOT NULL,
    edit_date TEXT NOT NULL,
    edit_content TEXT NOT NULL,
    old_content TEXT NOT NULL,
    FOREIGN KEY (article_id) REFERENCES articles(id)
);

DROP TABLE IF EXISTS comments;
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    origin_type TEXT NOT NULL CHECK (origin_type IN ('article', 'blog', 'user_profile')),
    origin_id TEXT NOT NULL,
    commenter TEXT NOT NULL,
    creation_date TEXT NOT NULL,
    content TEXT NOT NULL,
    reply_to INTEGER,
    FOREIGN KEY (reply_to) REFERENCES comments(id)
);

DROP TABLE IF EXISTS blogs;
CREATE TABLE IF NOT EXISTS blogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT, 
    parent INTEGER DEFAULT 0, 
    part INTEGER DEFAULT 0 CHECK (part = 0 OR (part > 0 AND parent != 0)),
    description TEXT DEFAULT '', 
    author TEXT DEFAULT 'Anonymous', 
    content TEXT, 
    creation_date TEXT, 
    last_modified TEXT, 
    view_count INTEGER DEFAULT 0, 
    tags TEXT, 
    comments_enabled INTEGER DEFAULT 1, 
    style TEXT, 
    music TEXT, 
    includeglobal INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_comments_origin ON comments (origin_type, origin_id);
CREATE INDEX IF NOT EXISTS idx_article_history ON edit_history (article_id);