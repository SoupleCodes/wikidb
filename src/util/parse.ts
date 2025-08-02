export function parseIfArray(arrString: string) {
    if (!arrString || arrString == '') {
        return [];
    }
    try {
        const parsed = JSON.parse(arrString)
        return Array.isArray(parsed) ? parsed : []
    } catch (error) {
        console.error('Failed to parse DB JSON:', error)
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

export function checkMusicObject(music: Music) {
    
}