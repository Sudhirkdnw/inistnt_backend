const adjectives = ["Anonymous", "Secret", "Hidden", "Mysterious", "Silent", "Ghost", "Shadow", "Phantom", "Dark", "Invisible", "Unknown", "Masked", "Covert", "Stealth", "Whisper"];
const nouns = ["Fox", "Raven", "Soul", "Wolf", "Owl", "Panther", "Tiger", "Hawk", "Eagle", "Bear", "Viper", "Cobra", "Dragon", "Phoenix", "Leopard"];

function generateAnonymousName() {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adj} ${noun}`;
}

module.exports = { generateAnonymousName };
