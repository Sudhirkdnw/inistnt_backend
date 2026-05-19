const mongoose = require('mongoose');

const emailTemplateSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }, // e.g. 'otp_verification'
    subject: { type: String, required: true },
    content: { type: String, required: true }, // HTML content
    variables: [String], // Array of available placeholders like ['otp', 'username']
    lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('EmailTemplate', emailTemplateSchema);
