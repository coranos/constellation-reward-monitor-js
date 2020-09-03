'use strict';

const Discord = require('discord.js');
const client = new Discord.Client();
const http = require('http');

const defaultConfig = require('./default-config.json');
const config = require('./config.json');

// map of past rewards.
const rewardsByAddress = new Map();

client.on('ready', async () => {
  console.log(getDate(), 'INFO', `Logged in as ${client.user.tag}!`);
  await send('reward monitor online.');
});

client.on('message', (msg) => {
  if (msg.content === 'ping') {
    msg.reply('pong');
  }
});

const send = async (message) => {
  const discordGuildId = getConfig('discordGuildId');
  const guild = client.guilds.cache.get(discordGuildId);
  if (guild == undefined) {
    console.log(getDate(), 'ERROR', `guild '${discordGuildId}' is undefined, closing program.`);
    closeProgram();
    return;
  }
  const discordChannelName = getConfig('discordChannelName');
  const channels = client.channels.cache.filter((channel) => {
    if (getConfig('debug')) {
      console.log('channel', channel);
    }
    if (channel.type != 'text') {
      return false;
    }
    return channel.name == discordChannelName;
  });
  if (getConfig('debug')) {
    console.log('channels', channels);
  }
  if (channels.array().length == 0) {
    console.log(getDate(), 'ERROR', `no channel with name '${discordChannelName}' in guild ${guild.name}, closing program.`);
    closeProgram();
    return;
  }
  await channels.array()[0].send(message);
};

const leftPad = (number, length) => {
  let str = '' + number;
  while (str.length < length) {
    str = '0' + str;
  }
  return str;
};

const toWholeNumber = (balance) => {
  // console.log('toWholeNumber', 'balance', balance);
  const paddedBalance = leftPad(balance, 9);
  // console.log('toWholeNumber', 'paddedBalance', paddedBalance);
  const prefixLength = paddedBalance.length-8;
  // console.log('toWholeNumber', 'prefixLength', prefixLength);
  const prefix = paddedBalance.slice(0, prefixLength);
  // console.log('toWholeNumber', 'prefix', prefix);
  const suffix = paddedBalance.slice(-8);
  // console.log('toWholeNumber', 'suffix', suffix);
  return `${prefix}.${suffix}`;
};

const getConfig = (key) => {
  if (config[key] !== undefined) {
    return config[key];
  }
  return defaultConfig[key];
};

const getDate = () => {
  return new Date().toISOString();
};

const get = async ( path) => {
  if (config == undefined) {
    throw Error( 'config is a required parameter.' );
  }
  if (path == undefined) {
    throw Error( 'path is a required parameter.' );
  }
  return new Promise((resolve) => {
    const options = {
      method: 'GET',
      hostname: getConfig('mainNetHostname'),
      path: path,
      port: getConfig('mainNetPort'),
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    if (getConfig('debug')) {
      console.log(getDate(), 'get path', path);
      console.log(getDate(), 'curl', 'http://' + getConfig('mainNetHostname') + ':' + getConfig('mainNetPort') + path);
    }

    const req = http.request(options, (res) => {
      let chunks = '';
      res.on('data', (chunk) => {
        if (getConfig('debug')) {
          console.log(getDate(), 'get data', chunk.toString('utf8'));
        }
        if (chunk != 'null') {
          chunks += chunk;
        }
      });

      res.on('end', () => {
        if (getConfig('debug')) {
          console.log(getDate(), 'get end', chunks);
        }
        if (chunks.length == 0) {
          resolve({});
        } else {
          if (getConfig('debug')) {
            console.log(getDate(), 'get chunks', chunks);
          }

          if (chunks.startsWith('{')) {
            const json = JSON.parse(chunks);
            resolve(json);
          } else {
            resolve('{}');
          }
        }
      });
    });

    req.on('error', (error) => {
      console.log(getDate(), 'get error', error);
    });

    req.end();
  });
};

const getRewards = async () => {
  try {
    const addressPath = getConfig('addressPath');
    const addresses = getConfig('addresses');
    for (let ix = 0; ix < addresses.length; ix++) {
      const address = addresses[ix];
      const path = `/${addressPath}/${address}`;
      const addressData = await get(path);
      if (getConfig('debug')) {
        console.log(getDate(), 'addressData', addressData);
      }
      const rewardsBalance = addressData.rewardsBalance;
      if (rewardsBalance == undefined) {
        await send(`Address '${address}'' has no Rewards Balance. @here`);
      } else {
        if (rewardsByAddress.has(address)) {
          const previous = rewardsByAddress.get(address);
          const diff = BigInt(rewardsBalance) - BigInt(previous);
          if (diff <= BigInt(0)) {
            await send(`Address '${address}' has Rewards Balance ${toWholeNumber(rewardsBalance)}, previous ${toWholeNumber(previous)}, diff ${toWholeNumber(diff)}. @here`);
          } else {
            await send(`Address '${address}' has Rewards Balance ${toWholeNumber(rewardsBalance)}, previous ${toWholeNumber(previous)}, diff ${toWholeNumber(diff)}.`);
          }
        } else {
          await send(`Address '${address}' has Rewards Balance ${toWholeNumber(rewardsBalance)}, no previous.`);
        }
        rewardsByAddress.set(address, rewardsBalance);
      }
    }
  } catch (error) {
    console.log('error', error.message);
  }
  const timeout = getConfig('timeout');
  setTimeout(getRewards, timeout);
};

const closeProgram = async () => {
  console.log(getDate(), 'STARTED closing program.');
  await send('reward monitor offline.');
  await client.destroy();
  console.log(getDate(), 'SUCCESS closing program.');
  process.exit(0);
};

const run = async () => {
  process.on('SIGINT', closeProgram);
  try {
    await client.login(getConfig('discordToken'));
  } catch (error) {
    console.log(getDate(), 'ERROR', 'client.login error', error.message);
    closeProgram();
  }
  await getRewards();
};

run();
