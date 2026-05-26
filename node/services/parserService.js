export function parseOllamaResult(raw) {
    const extract = (label) => {
        const regex = new RegExp(`\\*\\*${label}:\\*\\*\\s*([\\s\\S]*?)(?=\\*\\*|$)`);
        const match = raw.match(regex);
        return match ? match[1].trim() : null;
    };

    return {
        translation: extract('Translation'),
        meaning: extract('Meaning'),
        example: extract('Example'),
        tip: extract('Tip')
    };
}

