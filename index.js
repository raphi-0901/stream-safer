import dotenv from 'dotenv';
import { TelegramBot } from "./src/TelegramBot.js";
import { spawn } from 'child_process';
import treeKill from 'tree-kill';
import fs from 'fs/promises';
import dayjs from 'dayjs';
import relativeTime from "dayjs/plugin/relativeTime.js";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import duration from "dayjs/plugin/duration.js";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter.js";
dayjs.extend(customParseFormat)
dayjs.extend(relativeTime)
dayjs.extend(isSameOrAfter)
dayjs.extend(duration)

dotenv.config()

console.log("Register bot!");
const telegramBot = new TelegramBot();

const currentRecordings = new Map();
const plannedRecordings = new Map();

telegramBot.bot.on(/\/record\s+([^ ]+)\s+([^ ]+)(?:\s+(\d+))?/, (msg, props) => {
    const streamUrl = props.match[1];
    const startDate = dayjs();
    const outputFilename = props.match[2];
    const endDate = isNaN(props.match[3]) ? startDate.add(2, "hours") : startDate.add(props.match[3], "minutes");
    const duration = endDate.diff(startDate, "milliseconds")
    const willRunFor = dayjs.duration(duration, "milliseconds").humanize()

    console.log("\n\n/record\n");
    console.log('streamUrl :>> ', streamUrl);
    console.log('startDate :>> ', startDate.format('DD.MM.YYYY HH:mm'));
    console.log('endDate :>> ', endDate.format('DD.MM.YYYY HH:mm'));
    console.log('outputFilename :>> ', outputFilename);
    console.log('duration :>> ', willRunFor);
    console.log("\n\n");

    if(!validateDaterange(startDate, endDate)) {
        return
    }

    if (currentRecordings.has(streamUrl)) {
        console.error("Already recording this stream.");
        return telegramBot.sendMessage("Already recording this stream.");
    }

    startRecording(streamUrl, duration, outputFilename, msg.message_id);
    console.info("Recording started.");
    return telegramBot.sendMessage("Recording started.");
});

// /plan-record <url> <startingPoint> <endPoint|duration> <name>
telegramBot.bot.on(/^\/plan-record (.+) (.+) (.+) (.+)$/, (msg, props) => {
    const streamUrl = props.match[1];
    const outputFilename = props.match[2];
    const startDate = dayjs(props.match[3], "DD.MM.YYYY-HH:mm");
    const endDate = dayjs(props.match[4], "DD.MM.YYYY-HH:mm");
    const startRecordingInMinutes = startDate.fromNow()
    const duration = endDate.diff(startDate, "milliseconds")
    const willRunFor = dayjs.duration(duration, "milliseconds").humanize()

    console.log("\n\n/plan-record\n");
    console.log('streamUrl :>> ', streamUrl);
    console.log('startDate :>> ', startDate.format('DD.MM.YYYY HH:mm'));
    console.log('endDate :>> ', endDate.format('DD.MM.YYYY HH:mm'));
    console.log('outputFilename :>> ', outputFilename);
    console.log('duration :>> ', willRunFor);
    console.log('startRecordingInMinutes :>> ', startRecordingInMinutes);
    console.log("\n\n");

    if(!validateDaterange(startDate, endDate)) {
        return
    }

    const plannedRecordingsForThisUrl = plannedRecordings.get(streamUrl) || []

    if(!Array.isArray(plannedRecordingsForThisUrl)) { 
        // should never happen  
       return;
    }

    const overlappingRanges = plannedRecordingsForThisUrl.some(plannedRecording => plannedRecording.startDate.isBefore(endDate) && startDate.isBefore(plannedRecording.endDate))

    if(overlappingRanges) {
        console.error("Overlapping ranges with other planned recordings");
        return telegramBot.sendMessage("Overlapping ranges with other planned recordings");
    }

    const timeout = setTimeout(() => {
        if (currentRecordings.has(streamUrl)) {
            console.error("Already recording this stream. Planned stream gets withdrawn.");
            return telegramBot.sendMessage("Already recording this stream. Planned stream gets withdrawn.");
        }

        startRecording(streamUrl, duration, outputFilename, msg.message_id);
        removeEntryFromPlannedRecordings(streamUrl, startDate, endDate);

        console.info(`Planned recording of "${outputFilename}" started. It will run for ${willRunFor}`);
        return telegramBot.sendMessage(`Planned recording of "${outputFilename}" started. It will run for ${willRunFor}`);
    }, startDate.diff(dayjs(), "milliseconds"))

    plannedRecordingsForThisUrl.push({ timeout, startDate, endDate, duration: willRunFor, name: outputFilename });
    plannedRecordings.set(streamUrl, plannedRecordingsForThisUrl);

    console.info(`Successfully planned recording. It will start ${startRecordingInMinutes}`);
    return telegramBot.sendMessage(`Successfully planned recording. It will start ${startRecordingInMinutes}`);
});

telegramBot.bot.on("/planned", () => {
    let string = ""

    if(plannedRecordings.size === 0) {
        console.info("No planned recordings.");
        telegramBot.sendMessage("No planned recordings.");
        return;
    }

    plannedRecordings.forEach((value, key) => {
        console.log(key, value)
        string += "\n"+key+":\n";

        value.forEach(recording => {
            string += `\n\t\t${recording.name}: ${recording.startDate.format('DD.MM.YYYY HH:mm')} - ${recording.endDate.format('DD.MM.YYYY HH:mm')} (${recording.duration})`
        })
    })

    return telegramBot.sendMessage(string);
});

telegramBot.bot.on("/cancel", (msg) => {
    if (!msg.reply_to_message?.text) {
        console.error("Nothing selected to cancel.");
        return telegramBot.sendMessage("Nothing selected to cancel.");
    }

    const regex = /^\/(plan-record) (.+)$/;
    const match = msg.reply_to_message.text.match(regex);
    if (match) {
        const words = match[2].split(/\s+/);

        if (plannedRecordings.has(words[0])) {
            const startDate = dayjs(words[2], "DD.MM.YYYY-HH:mm");
            const endDate = dayjs(words[3], "DD.MM.YYYY-HH:mm");

            if(!validateDaterange(startDate, endDate)) {
                return;
            }

            clearTimeout(getEntryFromPlannedRecordings(words[0], startDate, endDate).timeout)
            removeEntryFromPlannedRecordings(words[0], startDate, endDate)
            console.info("Planned recording canceled");
            return telegramBot.sendMessage("Planned recording canceled.");
        }
    }

    console.info("No planned recording found to cancel.");
    return telegramBot.sendMessage("No planned recording found to cancel.");
});

telegramBot.bot.on("/stop", (msg) => {
    if (!msg.reply_to_message?.text) {
        console.error("Nothing selected to stop.");
        return telegramBot.sendMessage("Nothing selected to stop.");
    }

    const regex = /^\/(record|plan-record) (.+)$/;
    const match = msg.reply_to_message.text.match(regex);
    if (match) {
        const words = match[2].split(/\s+/);

        if (currentRecordings.has(words[0])) {
            killStreamSafer(currentRecordings.get(words[0]))

            console.info("Recording stopped.");
            return telegramBot.sendMessage("Recording stopped.");
        } else if (plannedRecordings.has(words[0])) {
            console.info("No running stream found, but there is a planned recording!");
            return telegramBot.sendMessage("No running stream found, but there is a planned recording!");
        }
    }

    console.info("No stream found to stop.");
    return telegramBot.sendMessage("No stream found to stop.");
});

function startRecording(streamUrl, duration, outputFilename, replyToMessage) {
    const webmOutputFilename = outputFilename + ".webm";
    const childProcess = spawn('node', ['src/stream-safer.js', streamUrl, webmOutputFilename], { stdio: 'inherit' });
    currentRecordings.set(streamUrl, childProcess.pid);

    const timeout = setTimeout(() => killStreamSafer(childProcess.pid), duration);

    childProcess.on('exit', (code, signal) => {
        console.log(`Child process exited with code ${code} and signal ${signal}.`);
        clearTimeout(timeout);
        currentRecordings.delete(streamUrl);

        setTimeout(async () => {
            // wait a little bit before sending
            console.log('webmOutputFilename :>> ', webmOutputFilename);
            try {
                await telegramBot.sendFile(webmOutputFilename, outputFilename, replyToMessage)
            }
            catch(e) {
                console.log('e :>> ', e);
            }
            // telegramBot.sendFile(webmOutputFilename, outputFilename, replyToMessage)
            console.log('waited for sending :>> ');

            setTimeout(() => removeFile(webmOutputFilename), dayjs.duration(5, "seconds").asMilliseconds());
        }, dayjs.duration(5, "seconds").asMilliseconds())
    });
}

function removeEntryFromPlannedRecordings(streamUrl, startDate, endDate) {
    const plannedRecordingsForThisUrl = plannedRecordings.get(streamUrl) || []

    if(!Array.isArray(plannedRecordingsForThisUrl)) { 
        // should never happen  
       return;
    }

    const filteredRecordings = plannedRecordingsForThisUrl.filter(plannedRecording => !startDate.isSame(plannedRecording.startDate) || !endDate.isSame(plannedRecording.endDate))

    if(filteredRecordings.length === 0) {
        plannedRecordings.delete(streamUrl);
    } else {   
        plannedRecordings.set(streamUrl, filteredRecordings);
    }
}

function getEntryFromPlannedRecordings(streamUrl, startDate, endDate) {
    const plannedRecordingsForThisUrl = plannedRecordings.get(streamUrl) || []

    if(!Array.isArray(plannedRecordingsForThisUrl)) { 
        // should never happen  
       return;
    }

    return plannedRecordingsForThisUrl.find(plannedRecording => startDate.isSame(plannedRecording.startDate) && endDate.isSame(plannedRecording.endDate))
}

function validateDaterange(startDate, endDate) {
    if (!startDate.isValid() || !endDate.isValid()) {
        console.error("Invalid dates.");
        telegramBot.sendMessage("Invalid dates.");
        return false;
    }

    if (startDate.isSameOrAfter(endDate)) {
        console.error("Ending date is not after starting date.");
        telegramBot.sendMessage("Starting date is after ending date.");
        return false;
    }
    return true
}

function killStreamSafer(pid) {
    console.log("Killing child process.");
    treeKill(pid, "SIGTERM")
}

function removeFile(filePath) {
    fs.unlink(filePath)
        .then(() => {
            console.info(`${filePath} removed successfully`);
        })
        .catch((err) => {
            console.error('Error occurred while trying to remove the file:', err);
        });
}

telegramBot.bot.start();
