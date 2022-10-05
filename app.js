/*******************
 * Library Imports *
 *******************/

import _ from 'lodash'
import colors from 'chalk'
import dotenv from 'dotenv'
import TwitchJs from 'twitch-js'
dotenv.config()

/*****************
 * Configuration *
 *****************/

const DRY_RUN = false; /* Toggle ability to send messages */

const preferences = {
    channels: [
        'squishy_life'
    ],
    credentials: {
        username: `${process.env.TWITCH_USERNAME}`,
        token: `${process.env.TWITCH_PASSWORD}`
    },
    delays: {
        botResponseDefault: 0
    }
};


/******************
 * TwitchJS Setup *
 ******************/

// Create an instance of TwitchJS.
const chat = new TwitchJs.Chat({
    username: preferences.credentials.username,
    token: preferences.credentials.token,
    log: { level: 'error' }
});

// Extends TwitchJS functionality.
chat.say = limiter((msg, channel) => {
    if (!DRY_RUN)
        chat.send(`PRIVMSG #${channel} :${msg}`)
}, 1500);


/********************
 * Helper Functions *
 ********************/

/**
 * Returns the current time as a string, formatted with hours, minutes, seconds, and period.
 *
 * @example "[2:47:10 AM]"
 * @returns {string}
 */
const getFormattedTime = () =>
    new Date().toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: true })

/**
 * Create a queue of `fn` calls and execute them in order after `wait` milliseconds.
 *
 * @param fn {function}
 * @param wait {int}
 * @returns {function(): void}
 */
function limiter(fn, wait) {
    let isCalled = false,
        calls = [];

    const caller = function() {
        if (calls.length && !isCalled) {
            isCalled = true;
            calls.shift().call();
            setTimeout(function() {
                isCalled = false;
                caller()
            }, wait)
        }
    };

    return function() {
        calls.push(fn.bind(this, ...arguments));
        caller()
    }
}


/******************************
 * Message Handling Functions *
 ******************************/

// Handle any message sent by myself
function handleMyMessage(channel, username, message) {
    console.log(`[${getFormattedTime()}] <${colors.cyanBright(username)}> ${message}`)
}

// Handle any message sent from any other user
function handleOtherMessage(channel, username, message) {
    // Message includes an @ mention
    if (message.toLowerCase().includes('@' + preferences.credentials.username)) {
        const iterableMessage = message.split(' ').entries();

        let _message = '';

        // Reconstruct the original message with the emboldened username
        for (let [index, word] of iterableMessage) {
            if (word.toLowerCase().includes('@' + preferences.credentials.username))
                word = colors.whiteBright.bold(word);

            if (index > 0)
                _message += ' ';

            _message += word
        }

        console.log(colors.bgRed(`[${getFormattedTime()}] <${(username)}> ${_message}`))
    }
}


/*************************
 * TwitchJS Finalization *
 *************************/

// Listen for all public messages from users and bots
chat.on('PRIVMSG', (msg) => {
    msg.channel = msg.channel.replace('#', '');

    const params = [msg.channel, msg.username, msg.message];

    // Listen for specific users or bots
    switch (msg.username) {
        case preferences.credentials.username:
            handleMyMessage(...params);
            break;
        default:
            handleOtherMessage(...params)
            break;
    }
});

// Connect to IRC
chat.connect()
    .then(() => {
        // Join channels
        for (const channel of preferences.channels)
            chat.join(channel);

        // Clear the console and prepare for new output
        console.clear();
        console.log(colors.greenBright('Connection established.\n'))
    });

