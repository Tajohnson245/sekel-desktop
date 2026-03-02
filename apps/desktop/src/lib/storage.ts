import { supabase } from './supabase';

/**
 * Uploads an image file to the user's folder in the 'card-media' bucket.
 * @param file The file to upload.
 * @param userId The ID of the authenticated user.
 * @returns The public URL of the uploaded image.
 */
export async function uploadImage(file: File, userId: string): Promise<string> {
    if (!file) {
        throw new Error('No file provided');
    }

    if (!userId) {
        throw new Error('User not authenticated');
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
        throw new Error('File must be an image');
    }

    // Validate file size (e.g., max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_SIZE) {
        throw new Error('File size exceeds 5MB limit');
    }

    const timestamp = new Date().getTime();
    // Sanitize filename: replace spaces and special chars
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `${userId}/${timestamp}-${sanitizedName}`;

    const { error: uploadError } = await supabase.storage
        .from('card-media')
        .upload(filePath, file);

    if (uploadError) {
        console.error('Error uploading image:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data } = supabase.storage
        .from('card-media')
        .getPublicUrl(filePath);

    return data.publicUrl;
}
