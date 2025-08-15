interface Blog {
    author: string
    title: string
    content: string
    parent?: number
    part?: number
    tags?: string | string[] | null
    comments_enabled?: number | boolean
    style?: string
    includeglobal?: number | boolean
    music?: string
}