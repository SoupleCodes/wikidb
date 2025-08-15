interface Theme {
    id: number;
    title: string;
    author: string;
    reviewer: string;
    content: string;

    thumbnail: string;
    layout_html: string;
    layout_style: string;
    layout_javascript: string;
    tags?: string | string[] | null
    
    created_at: string;
    last_modified: string;
    view_count: number;
    favorites: number
}