export function parseIfArray(arrString: string | string[]) {
    try {
        if (typeof arrString === 'string') {
            let arr = JSON.parse(arrString)
            return Array.isArray(arr) ? arr : []
        } else {
            return Array.isArray(arrString) ? arrString : []
        }
    } catch (error) {
        console.error('Failed to parse DB JSON ARRAY:', error)
        console.log(arrString)
        return [];
    }
}

export function parseIfJSON(json: string) {
    try {
        const parsed = JSON.parse(json)
        return parsed
    } catch (error) {
        console.error('Failed to parse DB JSON:', error)
        return {};
    }
}