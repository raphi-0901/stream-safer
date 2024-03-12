import dotenv from 'dotenv';
import { TelegramBot } from "./src/TelegramBot.js";
import { spawn } from 'child_process';
import treeKill from 'tree-kill';
import fs from 'fs/promises';

dotenv.config()

console.log("Register bot!");
const telegramBot = new TelegramBot();
telegramBot.bot.on(/^\/record (.+) (\d+) (.+)$/, (msg, props) => {
    const streamUrl = props.match[1];
    const duration = props.match[2];
    const outputFilename = props.match[3];

    console.log('streamUrl :>> ', streamUrl, duration, outputFilename);
    startRecording(streamUrl, duration, outputFilename, msg.message_id);
    return telegramBot.sendMessage("Recording started.");
});

function startRecording(streamUrl, duration, outputFilename, replyToMessage) {
    const webmOutputFilename = outputFilename + ".webm";
    const childProcess = spawn('node', ['src/stream-safer.js', streamUrl, duration, webmOutputFilename], { stdio: 'inherit' });

    const MINUTES_MILLISECONDS = 1000 * 60;

    const timeout = setTimeout(() => {
        console.log(`Killing child process after ${duration} minutes.`);
        treeKill(childProcess.pid, "SIGTERM")
        console.log('childProcess :>> ', childProcess.killed);
    }, duration * MINUTES_MILLISECONDS);

    childProcess.on('exit', (code, signal) => {
        console.log(`Child process exited with code ${code} and signal ${signal}.`);
        clearTimeout(timeout);

        setTimeout(() => {
            // wait a little bit before sending
            telegramBot.sendFile(webmOutputFilename, outputFilename, replyToMessage)

            setTimeout(removeFile(webmOutputFilename), MINUTES_MILLISECONDS);
        }, 20000)
    });
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
