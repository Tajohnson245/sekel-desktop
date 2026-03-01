/**
 * Document Parser Utility (Frontend)
 * 
 * Helper function to read files as ArrayBuffers and send them to the Electron backend
 * for parsing.
 */

export async function parseFile(file: File, language?: string): Promise<{ filename: string, content: string }> {
    try {
        // Read file as ArrayBuffer to pass through Electron IPC
        const buffer = await file.arrayBuffer();

        return await window.electronAPI.parseDocument({
            name: file.name,
            buffer: buffer,
            type: file.type,
            language: language
        });
    } catch (error) {
        console.error(`Failed to parse file ${file.name}:`, error);
        throw error;
    }
}

export async function parseYoutube(url: string, language?: string): Promise<{ filename: string, content: string }> {
    try {
        return await window.electronAPI.parseDocument({
            name: "YouTube Video", // Backend will likely update this with actual title
            url: url,
            type: 'youtube',
            language: language
        });
    } catch (error) {
        console.error(`Failed to parse YouTube URL ${url}:`, error);
        throw error;
    }
}
