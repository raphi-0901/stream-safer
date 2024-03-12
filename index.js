import dotenv from 'dotenv';
import { TelegramBot } from "./src/TelegramBot.js";
import { spawn } from 'child_process';
import treeKill from 'tree-kill';
import fs from 'fs/promises';

dotenv.config()

console.log("Register bot!");
const telegramBot = new TelegramBot();

const map = new Map();

telegramBot.bot.on(/^\/record (.+)(?: (\d+))? (.+)$/, (msg, props) => {
    const streamUrl = props.match[1];
    const duration = props.match[2];
    const outputFilename = props.match[3];
    console.log('streamUrl :>> ', streamUrl, duration, outputFilename);

    if (map.has(streamUrl)) {
        return telegramBot.sendMessage("Already recording this stream.");
    }

    startRecording(streamUrl, duration, outputFilename, msg.message_id);
    return telegramBot.sendMessage("Recording started.");
});

telegramBot.bot.on("/stop", (msg) => {
    if (!msg.reply_to_message?.text) {
        return telegramBot.sendMessage("Nothing selected to stop.");
    }

    const parts = msg.reply_to_message.text.match(/^\/record (.+)(?: (\d+))? (.+)$/)
    if (parts && parts.length > 2 && map.has(parts[1])) {
        killStreamSafer(map.get(parts[1]))

        return telegramBot.sendMessage("Recording stopped.");
    }

    return telegramBot.sendMessage("No stream found to stop.");
});

function startRecording(streamUrl, duration, outputFilename, replyToMessage) {
    const webmOutputFilename = outputFilename + ".webm";
    const videoDuration = isNaN(duration) ? 120 : duration
    const childProcess = spawn('node', ['src/stream-safer.js', streamUrl, webmOutputFilename], { stdio: 'inherit' });
    map.set(streamUrl, childProcess.pid);
    const MINUTES_MILLISECONDS = 1000 * 60;

    const timeout = setTimeout(() => killStreamSafer(childProcess.pid), videoDuration * MINUTES_MILLISECONDS);

    childProcess.on('exit', (code, signal) => {
        console.log(`Child process exited with code ${code} and signal ${signal}.`);
        clearTimeout(timeout);
        map.delete(streamUrl);

        setTimeout(() => {
            // wait a little bit before sending
            telegramBot.sendFile(webmOutputFilename, outputFilename, replyToMessage)

            setTimeout(() => removeFile(webmOutputFilename), MINUTES_MILLISECONDS);
        }, MINUTES_MILLISECONDS * 0.5)
    });
}

function killStreamSafer(pid) {
    console.log(`Killing child process after minutes.`);
    treeKill(pid, "SIGTERM")
}

function removeFile(filePath) {
    fs.unlink(filePath)
        .then(() => {
            console.log(`${filePath} removed successfully`);
        })
        .catch((err) => {
            console.error('Error occurred while trying to remove the file:', err);
        });
}

telegramBot.bot.start();
