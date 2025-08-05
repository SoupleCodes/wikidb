import { parseIfArray } from '../util/parse';

export async function addUserData(objects: any[], db: D1Database) {
    const userDataMap = new Map<string, User>();
    const newArray = [];

    for (const object of objects) {
        const username = (object.commenter || object.follower).toLowerCase();
        let userData = userDataMap.get(username);

        if (!userData) {
            const results = await db.prepare(`
                SELECT
                    id,
                    username,
                    about_me,
                    display_name,
                    pfp_url,
                    signature,
                    location
                FROM users WHERE lowercase_username = ?
            `).bind(username).first();

            if (results) {
                const userResult = results as unknown as User;
                userResult.social_links = parseIfArray(results.social_links as unknown as string);
                userResult.fav_articles = parseIfArray(results.fav_articles as unknown as string);
                userResult.music = parseIfArray(results.fav_music as unknown as string);
                userData = userResult;

                userDataMap.set(username, userData);
            } else {
                console.warn(`User with username ${username} not found`)
                userData = null
                userDataMap.set(username, null)
            }
        }

        newArray.push({
            ...object,
            profile: userData
        });
    }

    return newArray.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}