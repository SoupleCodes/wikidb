interface User {
    id: number;
    username: string;
    lowercase_username: string;
    created_at: string;
    last_activity: string;
    last_login: string;
    about_me?: string;
    display_name?: string;
    view_count?: number;
    pfp_url?: string;
    banner_url?: string;
    signature?: string;
    location?: string;
    social_links?: string | string[];
    fav_articles?: string | number[];
    music?: string[] | string;
    style?: string;
}