interface User {
    id: number;
    username: string;
    lowercase_username: string;
    password_hash: string;
    password_changed_at: string;
    created_at: string;
    updated_at: string;
    last_login: string;
    about_me?: string;
    display_name?: string;
    view_count?: number;
    pfp_url?: string;
    signature?: string;
    location?: string;
    social_links?: string;
    fav_articles?: string;
    music?: string[];
    style?: string;
}