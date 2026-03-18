/**
 * Saves an image file to local media storage and returns a sekel-media:// URL.
 */
export async function uploadImage(file: File, userId: string): Promise<string> {
    if (!file) throw new Error('No file provided');
    if (!userId) throw new Error('User not authenticated');
    if (!file.type.startsWith('image/')) throw new Error('File must be an image');

    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
    if (file.size > MAX_SIZE) throw new Error('File size exceeds 5MB limit');

    const buffer = await file.arrayBuffer();
    return window.electronAPI.db.saveMediaFile({
        buffer,
        filename: file.name,
        userId,
        mimeType: file.type,
    });
}
