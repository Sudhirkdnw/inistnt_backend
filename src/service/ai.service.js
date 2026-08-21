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

const FALLBACK_MODELS = [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "groq/compound-mini"
];

async function executeWithFallback(createCall) {
    const configuredModel = getSetting("ai_model", "openai/gpt-oss-120b");
    const modelsToTry = [configuredModel, ...FALLBACK_MODELS.filter(m => m !== configuredModel)];

    let lastError = null;
    for (const model of modelsToTry) {
        try {
            return await createCall(model);
        } catch (err) {
            lastError = err;
            if (err.status === 404 || err.code === "model_not_found" || (err.message && err.message.includes("does not exist"))) {
                console.warn(`[AI Service] Model "${model}" unavailable, trying fallback...`);
                continue;
            }
            throw err;
        }
    }
    throw lastError || new Error("All AI models failed");
}

async function generateCaption(prompt) {
    const client = getGroqClient();
    const completion = await executeWithFallback(async (model) => {
        return await client.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a creative social media writer and confession enhancer for a college community app. Enhance the user's confession or text to make it engaging, authentic, relatable, and well-written. Keep the original intent and emotion intact (whether funny, romantic, secret, or thoughtful). Keep it concise (1-3 sentences). Include tasteful emojis."
                },
                {
                    role: "user",
                    content: `Enhance this confession/thought: "${prompt}"`
                }
            ],
            model,
            max_tokens: 250
        });
    });

    return completion.choices[0]?.message?.content?.replace(/^"|"$/g, '') || "";
}

async function generateHashtags(prompt) {
    const client = getGroqClient();
    const completion = await executeWithFallback(async (model) => {
        return await client.chat.completions.create({
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
            model,
            max_tokens: 200
        });
    });

    return completion.choices[0]?.message?.content || "";
}

async function generateBio(prompt) {
    const client = getGroqClient();
    const completion = await executeWithFallback(async (model) => {
        return await client.chat.completions.create({
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
            model,
            max_tokens: 150
        });
    });

    return completion.choices[0]?.message?.content?.replace(/^"|"$/g, '') || "";
}

async function improveBio(currentBio, instructions) {
    const client = getGroqClient();
    const completion = await executeWithFallback(async (model) => {
        return await client.chat.completions.create({
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
            model,
            max_tokens: 150
        });
    });

    return completion.choices[0]?.message?.content?.replace(/^"|"$/g, '') || "";
}

async function moderateContent(text) {
    try {
        if (!text || !text.trim()) {
            return { isSafe: true, reason: null, toxicityScore: 0 };
        }

        const client = getGroqClient();
        const completion = await executeWithFallback(async (model) => {
            return await client.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: "You are a content moderation AI. Analyze the given text for hate speech, extreme violence, sexual content, or severe harassment. You must output a valid JSON object with keys: isSafe (boolean), reason (string or null), and toxicityScore (number between 0 and 1)."
                    },
                    {
                        role: "user",
                        content: `Analyze this content for safety and return a JSON object: "${text}"`
                    }
                ],
                model,
                response_format: { type: "json_object" },
                max_tokens: 150
            });
        });

        const rawContent = completion.choices[0]?.message?.content || "{}";
        const parsed = JSON.parse(rawContent);
        return {
            isSafe: typeof parsed.isSafe === 'boolean' ? parsed.isSafe : true,
            reason: parsed.reason || null,
            toxicityScore: typeof parsed.toxicityScore === 'number' ? parsed.toxicityScore : 0
        };
    } catch (err) {
        console.warn("AI content moderation skipped (fallback safe):", err.message);
        return { isSafe: true, reason: null, toxicityScore: 0 };
    }
}

module.exports = { generateCaption, generateHashtags, generateBio, improveBio, moderateContent };

