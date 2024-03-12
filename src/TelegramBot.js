import TeleBot from 'telebot';
import axios from "axios";
import fs from "fs";

export class TelegramBot {
    constructor() {
        if (!TelegramBot.instance) {
            this.botToken = process.env.BOT_TOKEN;
            this.chatId = process.env.CHAT_ID;
            this.bot = new TeleBot(this.botToken);
            TelegramBot.instance = this;
        }
        return TelegramBot.instance;
    }

    async sendMessage(text) {
        this.bot.sendMessage(this.chatId, text);
    }

    async sendFile(filePath, caption, replyToMessage) {
        this.bot.sendDocument(this.chatId, filePath, { caption, replyToMessage });
    }
}
