/**
 * String Utility Functions
 * 
 * Helper functions for cleaning and formatting strings.
 */

/**
 * Strips basic markdown formatting from a string to make it more human-readable in plain text views.
 * Removes headers, bold/italic markers, links, and other common markdown symbols.
 */
export function stripMarkdown(text: string): string {
    if (!text) return "";

    return text
        // Remove bold/italic markers (***, **, *, ___, __, _)
        .replace(/(\*{1,3}|_{1,3})/g, "")
        // Remove headers (# Title)
        .replace(/^#+\s+/gm, "")
        // Remove links [text](url) -> text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        // Remove images ![alt](url) -> alt
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
        // Remove inline code `code`
        .replace(/`([^`]+)`/g, "$1")
        // Remove horizontal rules
        .replace(/^---$/gm, "")
        // Convert markdown list markers to clean bullets/indentation
        .replace(/^\s*[-*+]\s+/gm, "• ")
        // Remove extra whitespace specifically at the beginning of lines that might have been caused by header removal
        .replace(/^\s+/gm, (match) => match.includes("\n") ? match : "")
        // Trim overall text and normalize triple newlines to double
        .trim()
        .replace(/\n{3,}/g, "\n\n");
}
