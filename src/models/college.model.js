const mongoose = require('mongoose');

const collegeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    aliases: [{
        type: String,
        trim: true
    }],
    city: {
        type: String,
        trim: true,
        default: ""
    },
    state: {
        type: String,
        trim: true,
        default: ""
    },
    isActive: {
        type: Boolean,
        default: true
    },
    addedByAdmin: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

// Optimize search by name and aliases
collegeSchema.index({ name: 'text', aliases: 'text' });

module.exports = mongoose.model('college', collegeSchema);
