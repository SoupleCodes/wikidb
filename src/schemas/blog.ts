interface blogReqBody {
    title: string
    content: string
    parent?: number
    part?: number
    description?: string
    tags?: string | string[] | null
    comments_enabled?: number | boolean
    style?: string
    includeglobal?: number | boolean
    music?: string
}