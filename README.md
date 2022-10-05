# NodeJS Twitch IRC bot for SaltyTeemo
A simple IRC bot for the SaltyTeemo livestream on Twitch built with Node.JS

### Getting Started
1. Clone this repository: `git clone https://github.com/knakamura13/node-js-twitch-irc-bot-for-saltyteemo twitch-bot-js && cd twitch-bot-js`
 
2. Install NodeJS for your system: https://nodejs.org/en/download/

3. Install the project dependencies: `npm install`
    - Dependencies used in this project:
```
      "axios": "^0.21.1",
      "chalk": "^2.4.2",
      "dotenv": "^8.0.0",
      "fluent-ffmpeg": "^2.1.2",
      "jsonfile": "^5.0.0",
      "lodash": "^4.17.14",
      "mongodb": "^4.6.0",
      "pad": "^3.2.0",
      "twitch-js": "^2.0.0-beta.30"
```

4. Create a file at the root of the project called `.env` and add the following two lines,
replacing the placeholders with your personal credentials:
```
TWITCH_USERNAME=yourusername
TWITCH_PASSWORD=yourpassword
```
- Notes:
  * The file is probably hidden on your system. Use the command line/Terminal to open the file:
      * Windows: `Notepad .env`
      * MacOS: `open .env`
  * Your username should be all lowercase; i.e. `SaltyTeemo` should be written as `saltyteemo`
  * You can get your password (API key) from http://twitchapps.com/tmi/

5. Run the app: `npm start` OR `node app.js`
