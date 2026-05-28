const Groq = require("groq-sdk");

let groq = null;

const { getSetting } = require("../utils/settings");

let currentApiKey = null;

function getGroqClient() {
    if (!getSetting("ai_service_enabled", true)) {
        throw new Error("AI services are currently disabled by administrator");
    }

    const apiKey = getSetting("ai_api_key") || process.env.GROQ_API_KEY;
    if (!apiKey) {
        throw new Error("AI API Key is not set in system configurations");
    }

    if (!groq || currentApiKey !== apiKey) {
        groq = new Groq({ apiKey });
        currentApiKey = apiKey;
    }
    return groq;
}

async function generateCaption(prompt) {
    const client = getGroqClient();
    const completion = await client.chat.completions.create({
        messages: [
            {
                role: "system",
                content: "You are a creative social media caption writer. Generate engaging, trendy Instagram-style captions. Keep them concise (1-3 sentences). Include relevant emojis."
            },
            {
                role: "user",
                content: `Generate an Instagram caption for: ${prompt}`
            }
        ],
        model: getSetting("ai_model", "meta-llama/llama-4-scout-17b-16e-instruct"),
        max_tokens: 200
    });

    return completion.choices[0]?.message?.content || "";
}

async function generateHashtags(prompt) {
    const client = getGroqClient();
    const completion = await client.chat.completions.create({
        messages: [
            {
                role: "system",
                content: "You are a social media hashtag expert. Generate 10-15 relevant, trending hashtags. Return only hashtags separated by spaces, no other text."
            },
            {
                role: "user",
                content: `Generate Instagram hashtags for: ${prompt}`
            }
        ],
        model: getSetting("ai_model", "meta-llama/llama-4-scout-17b-16e-instruct"),
        max_tokens: 200
    });

    return completion.choices[0]?.message?.content || "";
}

async function generateBio(prompt) {
    const client = getGroqClient();
    const completion = await client.chat.completions.create({
        messages: [
            {
                role: "system",
                content: "You are a creative social media bio writer. Your task is to write short, engaging, and human-like bios for a college social app. Use a mix of text and relevant emojis. The tone should be casual, Gen-Z, and relatable. Avoid being robotic or formal. Keep it under 150 characters."
            },
            {
                role: "user",
                content: `Generate a social media bio based on these details: ${prompt}`
            }
        ],
        model: getSetting("ai_model", "meta-llama/llama-4-scout-17b-16e-instruct"),
        max_tokens: 150
    });

    return completion.choices[0]?.message?.content?.replace(/^"|"$/g, '') || "";
}

async function improveBio(currentBio, instructions) {
    const client = getGroqClient();
    const completion = await client.chat.completions.create({
        messages: [
            {
                role: "system",
                content: "You are an expert social media profile optimizer. Your task is to improve or rewrite an existing bio based on user instructions. Keep it engaging, short, and use a casual tone with emojis. Avoid being cringe. Keep it under 150 characters."
            },
            {
                role: "user",
                content: `Current Bio: "${currentBio}"\nInstructions: "${instructions}"\nRewrite this bio to be better:`
            }
        ],
        model: getSetting("ai_model", "meta-llama/llama-4-scout-17b-16e-instruct"),
        max_tokens: 150
    });

    return completion.choices[0]?.message?.content?.replace(/^"|"$/g, '') || "";
}

async function moderateContent(text) {
    const client = getGroqClient();
    const completion = await client.chat.completions.create({
        messages: [
            {
                role: "system",
                content: "You are a content moderation AI. Analyze the given text for hate speech, extreme violence, sexual content, or severe harassment. Respond ONLY in JSON format: { \"isSafe\": boolean, \"reason\": string | null, \"toxicityScore\": number (0-1) }. If safe, toxicityScore should be low."
            },
            {
                role: "user",
                content: `Analyze this content for safety: "${text}"`
            }
        ],
        model: getSetting("ai_model", "meta-llama/llama-4-scout-17b-16e-instruct"),
        response_format: { type: "json_object" },
        max_tokens: 150
    });

    try {
        return JSON.parse(completion.choices[0]?.message?.content || "{}");
    } catch (e) {
        return { isSafe: true, reason: null, toxicityScore: 0 };
    }
}

module.exports = { generateCaption, generateHashtags, generateBio, improveBio, moderateContent };
