interface blogReqBody {
    title: string
    content: string
    parent?: number
    part?: number
    description?: string
    tags?: string | string[]
    comments_enabled?: number | boolean
    thumbnail_url?: string
    style?: string
    includeglobal?: number | boolean
    music?: string
}