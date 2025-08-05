interface Comment {
    id: number;
    origin_type: string;
    origin_id: number | string;
    commenter: string;
    created_at: string;
    content: string;
    reply_to: number | null;
}