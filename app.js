/**
 *  Chub Bot
 *
 *  This version of bot.js handles:
 *      - submitting bets
 *      - farming mushrooms
 *      - responding to chuby1tubby in chat
 *      - monitoring chat in saltyteemo
 */

/*******************
 * Library Imports *
 *******************/

require('dotenv').config();
const pad = require('pad');
const _ = require('lodash');
const colors = require('chalk');
const jsonfile = require('jsonfile');
const TwitchJS = require('twitch-js').default;
const axios = require('axios');
const { MongoClient, ServerApiVersion } = require('mongodb');


/*****************
 * Configuration *
 *****************/

const DRY_RUN = true; /* Toggle live betting */

let preferences = {
    channels: [
        'saltyteemo'
    ],
    credentials: {
        username: `${process.env.TWITCH_USERNAME}`,
        token: `${process.env.TWITCH_PASSWORD}`
    },
    delays: {
        betting: 145,
        farm: 60 * 60 * 48, /* 24 hours */
        botResponseDefault: 0
    },
    betAmount: 1234, /* Default bet amount */
    betMultiplier: 1.0 /* 1% */ * 0.01 /* Converted to decimal format */
};


/*****************
 * MongoDB Setup *
 *****************/

const uri = "mongodb+srv://kyle:w49MvSVYGEr0lDyN@saltyteemo.sqeiy.mongodb.net/?retryWrites=true&w=majority";
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
let mongo;
client.connect(err => {
    mongo = client.db("saltyteemodb").collection("saltyteemo-users");

    getUserBalance(preferences.credentials.username).then(balance => {
        myBalance = balance;
        console.log(`Latest balance: ${myBalance}`);
    });
});


/******************
 * TwitchJS Setup *
 ******************/

// Create an instance of TwitchJS.
const { chat } = new TwitchJS({
    username: preferences.credentials.username,
    token: preferences.credentials.token,
    log: { level: 'error' }
});


/*********************
 * Global Properties *
 *********************/

let myBet = preferences.betAmount,
    myBalance = 0,
    myTeam = 'blue',
    opposingTeam = 'red',
    betComplete = false,
    totals = {
        blue: {
            mushrooms: 0,
            bets: 0
        },
        red: {
            mushrooms: 0,
            bets: 0
        }
    },
    timers = {
        firstBet: process.hrtime(),
        farm: process.hrtime()
    };

const msgVariants = {
    betCommands: [
        '!blue',
        '!red',
        'saltyt1Blue',
        'saltyt1Red'
    ]
};

const commands = {
    "!blue": function() {
        setBettingValues();
        commands.bet('blue', myBet)
    },
    "saltyt1Blue": function() {
        commands["!blue"]();
    },
    "!red": function() {
        setBettingValues();
        commands.bet('red', myBet)
    },
    "saltyt1Red": function() {
        commands["!red"]();
    },
    farm: function() {
        // Set the time of the current farm and send the farm command to chat
        timers.farm = process.hrtime();
        chat.say('!farm', preferences.channels[0])

        // Randomly select a new delay for the next farm
        const hour = 60 * 60;
        const rand = hour * 24 + Math.floor(Math.random() * hour * 24); // Rand hour between 24 and 48
        preferences.delays.farm = rand;
    },
    bet: function(team, amount) {
        chat.say(`!${team} ${amount}`, preferences.channels[0]);
        console.log(`Bet attempted: ${team} ${amount}`);
        betComplete = true;
    }
};


/*************
 * Functions *
 *************/

// Extends TwitchJS functionality.
chat.say = limiter((msg, channel) => {
    chat.send(`PRIVMSG #${channel} :${msg}`)
}, 1500);

// Returns the current time as a string, formatted with hours, minutes, seconds, and period. (ex: '[2:47:10 AM]')
function getFormattedTime() {
    return new Date().toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: true })
}

// Returns the current state of betting as a boolean.
function isBettingOpen() {
    return (totals.blue.mushrooms > 0 || totals.red.mushrooms > 0)
}

// Logs the current time with the total mushrooms and bets for each team.
function logCurrentTotals(team, mushrooms, user, message) {
    let seconds = '[' + process.hrtime(timers.firstBet)[0] + ' seconds]';
    let _blueMushrooms = colors.blueBright(totals.blue.mushrooms.toLocaleString());
    let _blueBets = colors.blueBright(`(${totals.blue.bets} bets)`);
    let _redMushrooms = colors.redBright(totals.red.mushrooms.toLocaleString());
    let _redBets = colors.redBright(`(${totals.red.bets} bets)`);
    let _blue = _blueMushrooms + ' ' + _blueBets;
    let _red = _redMushrooms + ' ' + _redBets;
    let _extra = '';

    console.log(pad(_blue, 34) + ' | ' + pad(pad(34, _red), 33) + pad(16, seconds) + colors.bold(_extra));

    updateFlaskAPI()
}

// Send latest stats to flask-api-salty-teemo on Heroku
function updateFlaskAPI(ended=false) {
    let data = {
        "live_stats": {
            "betting_is_open": isBettingOpen() || false,
            "blue": {
                "bets": totals.blue.bets || 0,
                "mushrooms": totals.blue.mushrooms || 0
            },
            "red": {
                "bets": totals.red.bets || 0,
                "mushrooms": totals.red.mushrooms || 0
            }
        }
    }

    if (ended) {
        data['live_stats']['betting_is_open'] = false;
    }

    const config = {
        method: 'POST',
        url: 'https://flask-api-salty-teemo.herokuapp.com/live-data',
        headers: { 
            'Content-Type': 'application/json'
        },
        data: JSON.stringify(data)
    };
    axios(config).then((response) => {
        // Do nothing
    }).catch((error) => {
        // Do nothing
    });
}

// Resets global betting properties and logs the time and other information.
function notifyBettingEnded() {
    console.log(colors.gray(`\n[${getFormattedTime()}] Betting has ended\n`));

    myBet = 0;
    myTeam = '';
    opposingTeam = '';
    betComplete = false;
    totals.red.bets = 0;
    totals.blue.bets = 0;
    totals.red.mushrooms = 0;
    totals.blue.mushrooms = 0

    updateFlaskAPI(true);
}

// Decide how much to bet and which team to bet on.
function setBettingValues() {
    let higher = {};
    let lower = {};
    let blue = totals.blue;
    let red = totals.red;
    blue.name = 'blue';
    red.name = 'red';

    // Check which team is in the lead.
    if (red.mushrooms > blue.mushrooms) {
        higher = red;
        lower = blue
    } else {
        higher = blue;
        lower = red
    }

    // Determine team to bet on.
    myTeam = lower.name;
    opposingTeam = higher.name;

    // If the odds are close, bet on blue.
    if (lower.mushrooms / higher.mushrooms > 0.80) {
        console.log(`Falling back to blue team.`);
        myTeam = 'blue';
        opposingTeam = 'red';
    }

    // Determine amount to bet.
    myBet = preferences.betAmount;

    // Use a random bet between two values.
    const randomBetRange = [500, 1500];
    if (randomBetRange) {
        const [lower, upper] = randomBetRange;
        myBet = lower + Math.floor(Math.random() * (upper - lower));
    }

    // If the bet would bring my balance below 'x' shrooms, reduce the bet amount.
    const minBalance = 100000;
    const maxBet = Math.floor((myBalance - minBalance) * 0.1);
    if (myBet > maxBet) 
        myBet = maxBet;

    // If the bet is too small or not a valid number.
    if (myBet < 350 || myBet === 'NaN' || myBet === undefined) 
        myBet = 350;
}

// Create a queue of `fn` calls and execute them in order after `wait` milliseconds.
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

async function recordUserBalance(userName, balance) {
    const filter = { username: userName };
    const options = { upsert: true };
    const updateDoc = {
        $setOnInsert: { username: userName },
        $set: { balance: balance }
    };

    const result = await mongo.updateOne(filter, updateDoc, options);
}

async function getUserBalance(userName) {
    try {
        const balance = await mongo.findOne({ username: userName }).then(res => res.balance);
        return balance;
    } catch (err) {
        // Do nothing
    }

    return 50000;
}

// Once per second, check on the sate of the timers.
setInterval(() => {
    const _secondsSinceFarm = process.hrtime(timers.farm)[0],
        _secondsSinceFirstBet = process.hrtime(timers.firstBet)[0];

    // Farm mushrooms after x amount of seconds.
    if (_secondsSinceFarm >= preferences.delays.farm)
        commands.farm();

    // Manually set betting to ended after x amount of seconds.
    if (_secondsSinceFirstBet >= 330 && isBettingOpen())
        notifyBettingEnded();

    // Bet on a team after x amount of seconds.
    if (_secondsSinceFirstBet >= preferences.delays.betting && !betComplete && isBettingOpen()) {
        setBettingValues();
        if (!DRY_RUN)
            commands.bet(myTeam, myBet)
    }
}, 1000);


/******************************
 * Message Handling Functions *
 ******************************/

// Handle any message sent by xxsaltbotxx.
async function handleSaltbotMessage(channel, username, message) {
    const msg = message.toLowerCase().replaceAll('.', '').replaceAll(',', '');

    /*
     * Message includes a processed bet.
     * Latest variant(s):
     *   @username You placed 500 mushrooms on RED. Your new balance is 5,956 mushrooms. You can check your last action with !lastbet.
     *   @username You placed all of your mushrooms on RED.
     */
    if (msg.includes('you placed ')) {
        if (!isBettingOpen()) {
            // Record time of first bet.
            timers.firstBet = process.hrtime();
            console.log(colors.greenBright(`\n[${getFormattedTime()}] Betting has started\n`))
        }

        let mushrooms = 0,
            team = 'blue',
            balance = 0,
            split = [];

        // Check which user submitted the bet.
        split = msg.split(' ');
        let userName = split[0].replace('@', '');

        split = msg.split('you placed ')[1].split(' ');
        let _amount = split[0];
        if (_amount === 'all') {
            _amount = await getUserBalance(userName);
        } else {
            split = msg.split('new balance is ')[1].split(' ');
            balance = parseInt(split[0]);
        }

        mushrooms = parseInt(_amount);

        if (mushrooms < 2) mushrooms = 2;

        if (msg.includes(' red'))
            team = 'red';

        // Update totals for mushrooms and bets.
        totals[team].mushrooms += mushrooms;
        totals[team].bets += 1;

        // Check if bet was sent by my account.
        if (userName.includes(preferences.credentials.username)) {
            // Update global properties.
            myTeam = team.toLowerCase();
            opposingTeam = (myTeam === 'red') ? 'blue' : 'red';
            myBet = mushrooms;
            preferences.betAmount = myBet;
            betComplete = true;

            console.log(colors.grey(`\n[${getFormattedTime()}] Bet received\n`))
        }

        recordUserBalance(userName, balance);

        logCurrentTotals(team, mushrooms, userName, message)
    }

    // Betting is over
    if (isBettingOpen() && (
        message.includes('Betting has ended') || 
        message.includes('has closed') || 
        message.includes('not available'))) {
        notifyBettingEnded()
    }
}

// Handle any message sent by my own account.
function handleMyMessage(channel, username, message) {
    if (typeof commands[message] === 'function') {
        commands[message]();
    }

    let cmd = message.split(" ")[0];
    if (cmd === "!red" || cmd === "!blue" || cmd === 'saltyt1Red' || cmd === 'saltyt1Blue') {
        console.log('Bet placed manually in chat');
        betComplete = true;
    }

    console.log(`[${getFormattedTime()}] <${colors.cyanBright(username)}> ${message}`)
}

// Handle any message sent from any user other than those that are already handled.
function handleOtherMessage(channel, username, message, isWhisper=false) {
    // Message includes an @ mention.
    if (message.toLowerCase().includes('@' + preferences.credentials.username) || isWhisper) {
        let iterableMessage = message.split(" ");
        let _message = '';

        for (let [index, word] of iterableMessage.entries()) {
            if (word.toLowerCase().includes('@' + preferences.credentials.username))
                word = colors.whiteBright.bold(word);
            if (index > 0)
                _message += " ";
            _message += word
        }

        console.log(colors.bgRed(`[${getFormattedTime()}] <${(username)}> ${_message}`))
    }
}


/*************************
 * TwitchJS Finalization *
 *************************/

// Listen for all public messages from users and bots.
chat.on('PRIVMSG', (msg) => {
    msg.channel = msg.channel.replace("#", "");
    const params = [msg.channel, msg.username, msg.message];

    // Listen for specific users and bots.
    switch (msg.username) {
        case 'malphite_bot':
            handleSaltbotMessage(...params); break;
        case preferences.credentials.username:
            handleMyMessage(...params); break;
        default:
            handleOtherMessage(...params)
    }
});

// Listen for all whispers.
chat.on('WHISPER', (msg) => {
    handleOtherMessage(msg.channel.replace("#", ""), msg.username, msg.message, true)
});

// Connect to IRC.
chat.connect()
    .then(() => {
        // Join channels.
        for (const channel of preferences.channels)
            chat.join(channel);

        // Clear the console and prepare for new output.
        console.clear();
        console.log(colors.greenBright('Connection established\n'))
    });

