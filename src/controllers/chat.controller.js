const Conversation = require("../models/conversation.model");
const Message = require("../models/message.model");
const User = require("../models/user.model");
const Confession = require("../models/confession.model");
const { generateAnonymousName } = require("../utils/anonymousNames");

// Helper to anonymize participants
function anonymizeParticipants(conversation, currentUserId) {
    if (!conversation.isAnonymousChat) return conversation;
    
    // Convert to plain object if it's a Mongoose doc
    const conv = conversation.toObject ? conversation.toObject() : { ...conversation };
    
    // Mongoose Map converted to object via toObject() or accessed via get()
    const getIdentity = (id) => {
        if (!conv.anonymousIdentities) return "Anonymous User";
        if (typeof conv.anonymousIdentities.get === 'function') return conv.anonymousIdentities.get(id);
        return conv.anonymousIdentities[id] || "Anonymous User";
    };

    conv.participants = conv.participants.map(p => {
        const pId = p._id ? p._id.toString() : p.toString();
        if (pId !== currentUserId.toString()) {
            const identity = getIdentity(pId);
            return {
                _id: `anon_${pId.substring(0, 8)}`, // Mask ID
                username: identity,
                fullName: identity,
                avatar: "" // default anonymous avatar handled in frontend
            };
        }
        return p;
    });

    if (conv.lastMessage && conv.lastMessage.sender) {
        const sId = conv.lastMessage.sender._id ? conv.lastMessage.sender._id.toString() : conv.lastMessage.sender.toString();
        if (sId !== currentUserId.toString()) {
            const identity = getIdentity(sId);
            conv.lastMessage.sender = {
                _id: `anon_${sId.substring(0, 8)}`,
                username: identity,
                fullName: identity,
                avatar: ""
            };
        }
    }

    return conv;
}

async function getConversations(req, res) {
    try {
        const userId = req.user._id;
        const conversations = await Conversation.find({ participants: userId })
            .populate("participants", "username fullName avatar")
            .populate({
                path: "lastMessage",
                populate: { path: "sender", select: "username" }
            })
            .sort({ updatedAt: -1 })
            .lean();

        const conversationsWithUnread = await Promise.all(conversations.map(async (conv) => {
            const unreadCount = await Message.countDocuments({
                conversation: conv._id,
                sender: { $ne: userId },
                readBy: { $ne: userId }
            });
            return { ...conv, unreadCount };
        }));

        const sanitizedConversations = conversationsWithUnread.map(c => anonymizeParticipants(c, userId));

        res.status(200).json(sanitizedConversations);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function getOrCreateDM(req, res) {
    try {
        const { userId } = req.params;
        const currentUserId = req.user._id;

        if (userId === currentUserId.toString()) {
            return res.status(400).json({ message: "Cannot create DM with yourself" });
        }

        // Fetch target user to check privacy
        const targetUser = await User.findById(userId).select("isPrivate followers following");
        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }

        // ── Private Account Check ────────────────────────────────────────────
        // If the target account is private, only allow DM if:
        // 1. Target user follows the requester (they follow me back), OR
        // 2. Requester follows target user (I follow them — meaning they accepted/they're public to me)
        // In practice: both users must follow each other for a private user to be messaged
        if (targetUser.isPrivate) {
            const targetFollowsMe = targetUser.following.some(
                (id) => id.toString() === currentUserId.toString()
            );
            const iFollowTarget = targetUser.followers.some(
                (id) => id.toString() === currentUserId.toString()
            );

            if (!targetFollowsMe || !iFollowTarget) {
                return res.status(403).json({
                    message: "This account is private. You can only message users who follow you back.",
                    isPrivate: true
                });
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        // Check if DM already exists
        let conversation = await Conversation.findOne({
            type: "dm",
            participants: { $all: [currentUserId, userId] }
        }).populate("participants", "username fullName avatar");

        if (!conversation) {
            conversation = await Conversation.create({
                type: "dm",
                participants: [currentUserId, userId]
            });
            conversation = await conversation.populate("participants", "username fullName avatar");
        }

        res.status(200).json(conversation);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function startConfessionChat(req, res) {
    try {
        const { confessionId } = req.params;
        const currentUserId = req.user._id;

        const confession = await Confession.findById(confessionId);
        if (!confession) {
            return res.status(404).json({ message: "Confession not found" });
        }

        const authorId = confession.user.toString();
        if (authorId === currentUserId.toString()) {
            return res.status(400).json({ message: "Cannot message yourself" });
        }

        // Check if they follow each other (connected)
        const currentUserDoc = await User.findById(currentUserId);
        const authorDoc = await User.findById(authorId);

        const currentUserFollowsAuthor = currentUserDoc.following.includes(authorId);
        const authorFollowsCurrentUser = authorDoc.following.includes(currentUserId);

        const isConnected = currentUserFollowsAuthor || authorFollowsCurrentUser;

        if (isConnected) {
            // Normal DM
            let conversation = await Conversation.findOne({
                type: "dm",
                isAnonymousChat: false,
                participants: { $all: [currentUserId, authorId] }
            }).populate("participants", "username fullName avatar");

            if (!conversation) {
                conversation = await Conversation.create({
                    type: "dm",
                    participants: [currentUserId, authorId],
                    isAnonymousChat: false
                });
                conversation = await conversation.populate("participants", "username fullName avatar");
            }
            return res.status(200).json(conversation);
        } else {
            // Anonymous Chat
            const { getSetting } = require('../utils/settings');
            if (!getSetting('anonymous_chat', true)) {
                return res.status(403).json({ message: "Anonymous chatting is currently disabled" });
            }

            let conversation = await Conversation.findOne({
                type: "dm",
                isAnonymousChat: true,
                confessionId: confessionId,
                participants: { $all: [currentUserId, authorId] }
            }).populate("participants", "username fullName avatar");

            if (!conversation) {
                const identities = {
                    [currentUserId.toString()]: generateAnonymousName(),
                    [authorId]: generateAnonymousName()
                };

                conversation = await Conversation.create({
                    type: "dm",
                    participants: [currentUserId, authorId],
                    isAnonymousChat: true,
                    confessionId: confessionId,
                    anonymousIdentities: identities
                });
                conversation = await conversation.populate("participants", "username fullName avatar");
            }

            return res.status(200).json(anonymizeParticipants(conversation, currentUserId));
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}
async function createGroup(req, res) {
    try {
        const { name, participantIds } = req.body;
        const currentUserId = req.user._id;

        if (!name || !participantIds || participantIds.length === 0) {
            return res.status(400).json({ message: "Group name and participants are required" });
        }

        const participants = [currentUserId, ...participantIds];

        let conversation = await Conversation.create({
            type: "group",
            name,
            admin: currentUserId,
            participants
        });

        conversation = await conversation.populate("participants", "username fullName avatar");

        res.status(201).json(conversation);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function getMessages(req, res) {
    try {
        const { id } = req.params;
        const currentUserId = req.user._id;

        // Pagination: ?limit=50&cursor=<ISO_timestamp_of_oldest_msg>
        const limit  = Math.min(parseInt(req.query.limit) || 50, 100);
        const cursor = req.query.cursor;

        const conversation = await Conversation.findOne({ _id: id, participants: currentUserId });
        if (!conversation) {
            return res.status(403).json({ message: "Not a participant in this conversation" });
        }

        const filter = { conversation: id };
        if (cursor) filter.createdAt = { $lt: new Date(cursor) };

        let messages = await Message.find(filter)
            .populate("sender", "username avatar")
            .sort({ createdAt: -1 })
            .limit(limit);
            
        messages = messages.map(msg => {
            const m = msg.toObject();
            if (conversation.isAnonymousChat && m.sender._id.toString() !== currentUserId.toString()) {
                const sId = m.sender._id.toString();
                
                let identity = "Anonymous User";
                if (conversation.anonymousIdentities) {
                    identity = typeof conversation.anonymousIdentities.get === 'function' 
                        ? conversation.anonymousIdentities.get(sId) 
                        : conversation.anonymousIdentities[sId];
                    if (!identity) identity = "Anonymous User";
                }

                m.sender._id = `anon_${sId.substring(0, 8)}`; // Mask ID
                m.sender.username = identity;
                m.sender.avatar = "";
            }
            // Scrub readBy
            if (conversation.isAnonymousChat && m.readBy) {
                m.readBy = m.readBy.map(id => {
                    const strId = id.toString();
                    return strId === currentUserId.toString() ? strId : `anon_${strId.substring(0, 8)}`;
                });
            }
            return m;
        });

        res.status(200).json(messages.reverse());
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function sendMessage(req, res) {
    try {
        const { id } = req.params; // conversation id
        const { text, tempId } = req.body; // tempId from optimistic UI
        const currentUserId = req.user._id;

        let mediaUrl = undefined;
        let mediaType = undefined;

        if (req.file) {
            const base64 = req.file.buffer.toString("base64");
            mediaUrl = `data:${req.file.mimetype};base64,${base64}`;
            
            if (req.file.mimetype.startsWith("image/")) mediaType = "image";
            else if (req.file.mimetype.startsWith("video/")) mediaType = "video";
            else if (req.file.mimetype.startsWith("audio/")) mediaType = "audio";
        }

        if ((!text || !text.trim()) && !mediaUrl) {
            return res.status(400).json({ message: "Message text or media is required" });
        }

        // Verify participation
        const conversation = await Conversation.findOne({ _id: id, participants: currentUserId });
        if (!conversation) {
            return res.status(403).json({ message: "Not a participant in this conversation" });
        }

        const message = await Message.create({
            conversation: id,
            sender: currentUserId,
            text: text ? text.trim() : "",
            mediaUrl,
            mediaType,
            readBy: [currentUserId]
        });

        await message.populate("sender", "username avatar");

        // Update conversation's lastMessage and timestamp
        conversation.lastMessage = message._id;
        await conversation.save();

        // Emit via Socket.io
        const io = req.app.get("io");
        if (io) {
            const msgPayload = { ...message.toObject(), _tempId: tempId || null };

            // For sender
            io.to(currentUserId.toString()).emit("receive-message", msgPayload);

            conversation.participants.forEach(participantId => {
                const pid = participantId.toString();
                if (pid !== currentUserId.toString()) {
                    // For recipient, check anonymity
                    let recipientMsgPayload = JSON.parse(JSON.stringify(msgPayload)); // Deep copy to avoid mutating reference for other recipients
                    if (conversation.isAnonymousChat) {
                        const sId = currentUserId.toString();
                        
                        let identity = "Anonymous User";
                        if (conversation.anonymousIdentities) {
                            identity = typeof conversation.anonymousIdentities.get === 'function' 
                                ? conversation.anonymousIdentities.get(sId) 
                                : conversation.anonymousIdentities[sId];
                            if (!identity) identity = "Anonymous User";
                        }

                        recipientMsgPayload.sender._id = `anon_${sId.substring(0, 8)}`; // Mask ID
                        recipientMsgPayload.sender.username = identity;
                        recipientMsgPayload.sender.avatar = "";
                        
                        if (recipientMsgPayload.readBy) {
                            recipientMsgPayload.readBy = recipientMsgPayload.readBy.map(id => {
                                const strId = id.toString();
                                return strId === pid ? strId : `anon_${strId.substring(0, 8)}`;
                            });
                        }
                    }
                    
                    io.to(pid).emit("receive-message", recipientMsgPayload);

                    // Lightweight notification
                    const notifPayload = {
                        conversationId: id,
                        sender: recipientMsgPayload.sender,
                        text: message.text,
                        messageId: message._id.toString()
                    };
                    io.to(pid).emit("new-message-notification", notifPayload);
                }
            });
        }

        res.status(201).json(message);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function addGroupMember(req, res) {
    try {
        const { id } = req.params;
        const { userId } = req.body;
        const currentUserId = req.user._id;

        const conversation = await Conversation.findOne({ _id: id, type: "group", admin: currentUserId });
        if (!conversation) {
            return res.status(403).json({ message: "Not authorized or conversation is not a group" });
        }

        if (!conversation.participants.includes(userId)) {
            conversation.participants.push(userId);
            await conversation.save();
        }

        res.status(200).json(conversation);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function removeGroupMember(req, res) {
    try {
        const { id, userId } = req.params;
        const currentUserId = req.user._id;

        const conversation = await Conversation.findOne({ _id: id, type: "group", admin: currentUserId });
        if (!conversation) {
            return res.status(403).json({ message: "Not authorized or conversation is not a group" });
        }

        conversation.participants = conversation.participants.filter(p => p.toString() !== userId);
        await conversation.save();

        res.status(200).json(conversation);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function deleteMessage(req, res) {
    try {
        const { messageId } = req.params;
        const currentUserId = req.user._id;

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ message: "Message not found" });
        }

        if (message.sender.toString() !== currentUserId.toString()) {
            return res.status(403).json({ message: "Not authorized to delete this message" });
        }

        const conversationId = message.conversation;
        await message.deleteOne();

        // Check if we need to update lastMessage
        const conversation = await Conversation.findById(conversationId);
        if (conversation && conversation.lastMessage?.toString() === messageId) {
            const lastMsg = await Message.findOne({ conversation: conversationId }).sort({ createdAt: -1 });
            conversation.lastMessage = lastMsg ? lastMsg._id : null;
            await conversation.save();
            
            const io = req.app.get("io");
            if (io) {
                conversation.participants.forEach(participantId => {
                    io.to(participantId.toString()).emit("conversation-updated", conversation);
                });
            }
        }

        const io = req.app.get("io");
        if (io) {
            io.to(conversationId.toString()).emit("message-deleted", { messageId, conversationId });
        }

        res.status(200).json({ message: "Message deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function deleteConversation(req, res) {
    try {
        const { id } = req.params;
        const currentUserId = req.user._id;

        const conversation = await Conversation.findById(id);
        if (!conversation) {
            return res.status(404).json({ message: "Conversation not found" });
        }

        // Verify participation
        if (!conversation.participants.includes(currentUserId)) {
            return res.status(403).json({ message: "Not authorized to delete this conversation" });
        }

        await Message.deleteMany({ conversation: id });
        await conversation.deleteOne();

        const io = req.app.get("io");
        if (io) {
            conversation.participants.forEach(participantId => {
                io.to(participantId.toString()).emit("conversation-deleted", { conversationId: id });
            });
        }

        res.status(200).json({ message: "Conversation deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function likeMessage(req, res) {
    try {
        const { messageId } = req.params;
        const currentUserId = req.user._id;

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ message: "Message not found" });
        }

        const conversation = await Conversation.findById(message.conversation);
        if (!conversation || !conversation.participants.includes(currentUserId)) {
            return res.status(403).json({ message: "Not authorized" });
        }

        const likeIndex = message.likes.indexOf(currentUserId);
        if (likeIndex === -1) {
            message.likes.push(currentUserId);
        } else {
            message.likes.splice(likeIndex, 1);
        }

        await message.save();

        const io = req.app.get("io");
        if (io) {
            io.to(message.conversation.toString()).emit("message-liked", {
                messageId: message._id,
                likes: message.likes
            });
        }

        res.status(200).json(message);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function markAsRead(req, res) {
    try {
        const { id } = req.params; // conversation id
        const currentUserId = req.user._id;

        const conversation = await Conversation.findById(id);
        if (!conversation || !conversation.participants.includes(currentUserId)) {
            return res.status(403).json({ message: "Not authorized" });
        }

        await Message.updateMany(
            { conversation: id, readBy: { $ne: currentUserId } },
            { $push: { readBy: currentUserId } }
        );

        const io = req.app.get("io");
        if (io) {
            conversation.participants.forEach(pid => {
                const pidStr = pid.toString();
                // Send the real currentUserId to the person marking it read if they want to update their own UI,
                // but for the OTHER person (who sent the message), mask it if anonymous
                let emitUserId = currentUserId.toString();
                if (conversation.isAnonymousChat && pidStr !== currentUserId.toString()) {
                    emitUserId = `anon_${emitUserId.substring(0, 8)}`;
                }
                
                io.to(pidStr).emit("conversation-read", {
                    conversationId: id,
                    userId: emitUserId
                });
            });
        }

        res.status(200).json({ message: "Messages marked as read" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

module.exports = {
    getConversations,
    getOrCreateDM,
    createGroup,
    startConfessionChat,
    getMessages,
    sendMessage,
    addGroupMember,
    removeGroupMember,
    deleteMessage,
    deleteConversation,
    likeMessage,
    markAsRead
};
