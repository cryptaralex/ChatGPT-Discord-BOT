// Imports
import dotenv from 'dotenv'; dotenv.config();
import { ChatGPTAPI } from 'chatgpt';
import axios from 'axios';
import chalk from 'chalk';
import figlet from 'figlet';
import gradient from 'gradient-string';
import admin from 'firebase-admin';
import Keyv from 'keyv';
import KeyvFirestore from 'keyv-firestore';
import express from 'express';

const app = express();

import models from './models.js';
import {
  Client, REST, Partials,
  GatewayIntentBits, Routes,
  ActivityType, ChannelType,
  ApplicationCommandOptionType,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
}
  from 'discord.js';

// Import Firebase Admin SDK Service Account Private Key
const firebaseServiceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString());

import { channel } from 'diagnostics_channel';


// Defines
const activity = '/ask && /imagine && /help'
let botuser;
// Discord Slash Commands Defines
const commands = [
  {
    name: 'ask',
    description: 'Ask Anything!',
    dm_permission: false,
    options: [
      {
        name: "question",
        description: "Your question",
        type: 3,
        required: true
      }
    ]
  },
  {
    name: 'imagine',
    description: 'Generate an image using a prompt.',
    options: [
      {
        name: 'prompt',
        description: 'Enter your prompt',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: 'model',
        description: 'The image model',
        type: ApplicationCommandOptionType.String,
        choices: models,
        required: false,
      },
    ],
  },
  {
    name: 'ping',
    description: 'Check Websocket Heartbeat && Roundtrip Latency'
  },
  {
    name: 'reset-chat',
    description: 'Start A Fresh Chat Session'
  },
  {
    name: 'help',
    description: 'Get Help'
  }
];

// Initialize OpenAI Session
async function initOpenAI(messageStore) {
  if (process.env.API_ENDPOINT.toLocaleLowerCase() === 'default') {
    const api = new ChatGPTAPI({
      apiKey: process.env.OPENAI_API_KEY,
      completionParams: {
        model: process.env.MODEL,
      },
      messageStore,
      debug: process.env.DEBUG
    });
    return api;
  } else {
    const api = new ChatGPTAPI({
      apiKey: process.env.OPENAI_API_KEY,
      apiBaseUrl: process.env.API_ENDPOINT.toLocaleLowerCase(),
      completionParams: {
        model: process.env.MODEL,
      },
      messageStore,
      debug: process.env.DEBUG
    });
    return api;
  }
}

// Initialize Discord Application Commands & New ChatGPT Thread
async function initDiscordCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  try {
    console.log('Started refreshing application commands (/)');
    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands }).then(() => {
      console.log('Successfully reloaded application commands (/)');
    }).catch(e => console.log(chalk.red(e)));
    console.log('Connecting to Discord Gateway...');
  } catch (error) {
    console.log(chalk.red(error));
  }
}

async function initFirebaseAdmin() {
  admin.initializeApp({
    credential: admin.credential.cert(firebaseServiceAccount),
    databaseURL: `https://${firebaseServiceAccount.project_id}.firebaseio.com`
  });
  const db = admin.firestore();
  return db;
}

async function initKeyvFirestore() {
  const messageStore = new Keyv({
    store: new KeyvFirestore({
      projectId: firebaseServiceAccount.project_id,
      collection: 'messageStore',
      credentials: firebaseServiceAccount
    })
  });
  return messageStore;
}

// Main Function (Execution Starts From Here)
async function main() {
  if (process.env.UWU === 'true') {
    console.log(gradient.pastel.multiline(figlet.textSync('ChatGPT', {
      font: 'Univers',
      horizontalLayout: 'default',
      verticalLayout: 'default',
      width: 100,
      whitespaceBreak: true
    })));
  }

  const db = await initFirebaseAdmin();

  const messageStore = await initKeyvFirestore();

  const api = await initOpenAI(messageStore).catch(error => {
    console.error(error);
    process.exit();
  });

  await initDiscordCommands().catch(e => { console.log(e) });

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildIntegrations,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.DirectMessageTyping,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel]
  });

  console.log('Client created..');

  client.login(process.env.DISCORD_BOT_TOKEN).catch(e => console.log(chalk.red(e)));

  client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    botuser = client.user.id;
    console.log(chalk.greenBright('Connected to Discord Gateway'));
    console.log(new Date())
    client.user.setStatus('online');
    client.user.setActivity(activity);
  });

  // Channel Message Handler
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    client.user.setActivity(interaction.user.tag, { type: ActivityType.Watching });

    switch (interaction.commandName) {
    //  case "ask":
    //    ask_Interaction_Handler(interaction);
    //    break;
      case "imagine":
        imagine_Interaction_Handler(interaction);
        break;
      case "ping":
        ping_Interaction_Handler(interaction);
        break;
      case "help":
        help_Interaction_Handler(interaction);
        break;
      case 'reset-chat':
        reset_chat_Interaction_Handler(interaction);
        break;
      default:
        await interaction.reply({ content: 'Command Not Found' });
    }
  });

  // Direct Message and Channel Handler
  client.on("messageCreate", async message => {
    const dmCheck = process.env.DIRECT_MESSAGES === "true" && message.channel.type === ChannelType.DM;
    const channelCheck = process.env.CHANNEL_ID.includes(message.channel.id);
    const isMentioned = message.mentions.has(client.user) || message.content.toLowerCase().includes(process.env.BOT_NAME.toLowerCase());
    const shouldRespond = Math.random() < 0.0169 || isMentioned;
  
    if (message.author.bot || (!dmCheck && (!channelCheck || !shouldRespond))) {
      return;
    }
  
    if (!process.env.DM_WHITELIST_ID.includes(message.author.id) && dmCheck) {
      await message.author.send("You need a Signularity Ordinal to DM 🙄 \n Please submit your payment here, and contact a moderator with your txid. \n Join The Singularity: https://bit.ly/ordAI");
      const timeStamp = new Date();
      const date = timeStamp.getUTCDate().toString() + '.' + (timeStamp.getUTCMonth() + 1).toString() + '.' + timeStamp.getUTCFullYear().toString();
      const time = timeStamp.getUTCHours().toString() + ':' + timeStamp.getUTCMinutes().toString() + ':' + timeStamp.getUTCSeconds().toString();
      await db.collection('unauthorized-dm-log').doc(message.author.id)
        .collection(date).doc(time).set({
          timeStamp: new Date(),
          userId: message.author.id,
          user: message.author.tag,
          question: message.content,
          bot: message.author.bot
        });
      return;
    }
  
    console.log("----------Direct Message/Channel Message---------");
    console.log("Date & Time : " + new Date());
    console.log("UserId      : " + message.author.id);
    console.log("User        : " + message.author.tag);
    console.log("Question    : " + message.content);
  
    let sentMessage;
    if (dmCheck) {
      sentMessage = await message.channel.send("I'm thinking sweetie 🤔");
    }
  
    try {
      let interaction = {
        "user": {
          "id": message.author.id,
          'tag': message.author.tag
        }
      }
  
      askQuestion(message.content, interaction, async (response) => {
        if (!response.text) {
          if (response.length >= process.env.DISCORD_MAX_RESPONSE_LENGTH) {
            splitAndSendChannelResponse(response, message.channel)
          } else {
            if (dmCheck) {
              await sentMessage.edit(`API Error ❌\n\`\`\`\n${response}\n\`\`\`\n`)
            } else {
              await message.channel.send(`API Error ❌\n\`\`\`\n${response}\n\`\`\`\n`);
            }
          }
          return;
        }
      
        if (response.text.length >= process.env.DISCORD_MAX_RESPONSE_LENGTH) {
          splitAndSendChannelResponse(response.text, message.channel)
        } else {
          if (dmCheck) {
            await sentMessage.edit(response.text)
          } else {
            await message.channel.send(response.text);
          }
        }
        if(response.text.includes('![Image]')){

          
        
          try {
            const regex = /!\[Image\]\[([^[\]\s]*?)/;
            const prompt = 'midjrny-v4 style,' + response.text.match(regex)[1];
          
            console.log(prompt);
      
            const { default: Replicate } = await import('replicate');
      
            const replicate = new Replicate({
              auth: process.env.REPLICATE_API_KEY,
            });
      
        
            const model = models[0].value;
      
            const timeout = new Promise((_, reject) => {
              setTimeout(() => {
                reject(new Error('Replication deadline exceeded.'));
              }, 90000); // Adjust the timeout duration as needed
            });
            const output = await Promise.race([replicate.run(model, { input: { prompt } }), timeout]);
            await message.channel.send(output[0]);
           //console.log("output would be here");
          }catch(error){
            console.log(error);
          }      





          console.log("found the image tag in the response");
        }
      


        console.log("Response    : " + response.text);
        console.log("---------------End---------------");
        const timeStamp = new Date();
        const date = timeStamp.getUTCDate().toString() + '.' + (timeStamp.getUTCMonth() + 1).toString() + '.' + timeStamp.getUTCFullYear().toString();
        const time = timeStamp.getUTCHours().toString() + ':' + timeStamp.getUTCMinutes().toString() + ':' + timeStamp.getUTCSeconds().toString();
        await db.collection('dm-history').doc(message.author.id)
          .collection(date).doc(time).set({
            timeStamp: new Date(),
            userId: message.author.id,
            user: message.author.tag,
            question: message.content,
            answer: response.text,
            parentMessageId: response.id
          });
      })
    } catch (e) {
      console.error(e)
    }
  });
  
  

  async function ping_Interaction_Handler(interaction) {
    const sent = await interaction.reply({ content: 'Pinging...🌐', fetchReply: true });
    await interaction.editReply(`Websocket Heartbeat: ${interaction.client.ws.ping} ms. \nRoundtrip Latency: ${sent.createdTimestamp - interaction.createdTimestamp} ms\n`);
    client.user.setActivity(activity);
  }

  async function help_Interaction_Handler(interaction) {
    await interaction.reply("**Singularity AI**\nA Discord AI Bot Powered by Bitcoin Ordinals!\n\n**Usage:**\nDM - Ask Anything\n`/ask` - Ask Anything\n`/reset-chat` - Start A Fresh Chat Session\n`/ping` - Check Websocket Heartbeat && Roundtrip Latency\n\nSupport Server: https://discord.gg/btcai");
    client.user.setActivity(activity);
  }

  async function reset_chat_Interaction_Handler(interaction) {
    const timeStamp = new Date();
    const date = timeStamp.getUTCDate().toString() + '.' + timeStamp.getUTCMonth().toString() + '.' + timeStamp.getUTCFullYear().toString();
    const time = timeStamp.getUTCHours().toString() + ':' + timeStamp.getUTCMinutes().toString() + ':' + timeStamp.getUTCSeconds().toString();
    await interaction.reply('Checking...📚');
    const doc = await db.collection('users').doc(interaction.user.id).get();
    if (!doc.exists) {
      console.log('Failed: No Conversation Found ❌');
      await interaction.editReply('No Conversation Found ❌\nUse `/ask` To Start One\n');
      await db.collection('reset-chat-log').doc(interaction.user.id)
        .collection(date).doc(time).set({
          timeStamp: new Date(),
          userID: interaction.user.id,
          user: interaction.user.tag,
          resetChatSuccess: 0
        });
    } else {
      await db.collection('users').doc(interaction.user.id).delete();
      console.log('Chat Reset: Successful ✅');
      await interaction.editReply('Chat Reset: Successful ✅\n');
      await db.collection('reset-chat-log').doc(interaction.user.id)
        .collection(date).doc(time).set({
          timeStamp: new Date(),
          userID: interaction.user.id,
          user: interaction.user.tag,
          resetChatSuccess: 1
        });
    }

    client.user.setActivity(activity);
  }

  async function imagine_Interaction_Handler(interaction) {
    try {
      await interaction.deferReply();

      const { default: Replicate } = await import('replicate');

      const replicate = new Replicate({
        auth: process.env.REPLICATE_API_KEY,
      });

      const prompt = interaction.options.getString('prompt');
      const model = interaction.options.getString('model') || models[0].value;

      const timeout = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Replication deadline exceeded.'));
        }, 90000); // Adjust the timeout duration as needed
      });
      const output = await Promise.race([replicate.run(model, { input: { prompt } }), timeout]);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel(`Download`)
          .setStyle(ButtonStyle.Link)
          .setURL(`${output[0]}`)
          .setEmoji('1101133529607327764')
      );

      const resultEmbed = new EmbedBuilder()
        .setTitle('Image Generated')
        .addFields({ name: 'Prompt', value: prompt })
        .setImage(output[0])
        .setColor('#44a3e3')
        .setFooter({
          text: `Requested by ${interaction.user.username}`,
          iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
        });

      await interaction.editReply({
        embeds: [resultEmbed],
        components: [row],
      });
    } catch (error) {
      const errEmbed = new EmbedBuilder()
        .setTitle('An error occurred')
        .setDescription('```' + error + '```')
        .setColor(0xe32424);

    try {     
    interaction.editReply({ embeds: [errEmbed] });
    } catch (error){console.log("An Error occured during handling an error");}
    }
  }

  

   async function ask_Interaction_Handler(interaction) {
    const question = interaction.options.getString("question");

    console.log("----------Channel Message--------");
   console.log("Date & Time : " + new Date());
    console.log("UserId      : " + interaction.user.id);
   console.log("User        : " + interaction.user.tag);
    console.log("Question    : " + question);

    try {
      await interaction.reply({ content: `I'm thinking 🤔` });
      askQuestion(question, interaction, async (content) => {
        if (!content.text) {
           if (content.length >= process.env.DISCORD_MAX_RESPONSE_LENGTH) {
           await interaction.editReply(`**${interaction.user.tag}:** ${question}\n**${client.user.username}:** API Error ❌\nCheck DM For Error Log ❗\n`);
           splitAndSendResponse(content, interaction.user);
          } else {
            await interaction.editReply(`**${interaction.user.tag}:** ${question}\n**${client.user.username}:** API Error ❌\n\`\`\`\n${content}\n\`\`\`\n`);
          }
          client.user.setActivity(activity);
          return;
        }

        console.log("Response    : " + content.text);
        console.log("---------------End---------------");

        if (content.text.length >= process.env.DISCORD_MAX_RESPONSE_LENGTH) {
          await interaction.editReply({ content: "The Answer Is Too Powerful 🤯,\nCheck Your DM 😅" });
          splitAndSendResponse(content.text, interaction.user);
        } else {
          await interaction.editReply(`**${interaction.user.tag}:** ${question}\n**${client.user.username}:** ${content.text}\n`);
        }
        client.user.setActivity(activity);
        const timeStamp = new Date();
        const date = timeStamp.getUTCDate().toString() + '.' + timeStamp.getUTCMonth().toString() + '.' + timeStamp.getUTCFullYear().toString();
        const time = timeStamp.getUTCHours().toString() + ':' + timeStamp.getUTCMinutes().toString() + ':' + timeStamp.getUTCSeconds().toString();
        await db.collection('chat-history').doc(interaction.user.id)
          .collection(date).doc(time).set({
            timeStamp: new Date(),
            userID: interaction.user.id,
            user: interaction.user.tag,
            question: question,
            answer: content.text,
            parentMessageId: content.id
          });
      })
    } catch (e) {
      console.error(chalk.red(e));
    }
   }

  async function askQuestion(question, interaction, cb) {
    const doc = await db.collection('users').doc(interaction.user.id).get();
    const currentDate = new Date().toISOString();
    const finalSystemMessage = process.env.SYSTEM_MESSAGE;


    const customPrompt = process.env.PROMPT_TEXT;
    const extraPrompt = `You are <@${botuser}> in the discord server. People will tag you with <@${botuser}> as that's your name there and you will respond. Examples: user: Hi <@${botuser}> ! Assistant: Hello ${interaction.user.tag}, I hope you are having a wonderful day.\n USER MESSAGE FOLLOWS:\n`

    if (!doc.exists) {
      api.sendMessage(customPrompt + extraPrompt + question, {
        systemMessage: finalSystemMessage
      }).then((response) => {
        db.collection('users').doc(interaction.user.id).set({
          timeStamp: new Date(),
          userId: interaction.user.id,
          user: interaction.user.tag,
          parentMessageId: response.id
        });
        cb(response);
      }).catch((err) => {
        cb(err);
        console.log(chalk.red("AskQuestion Error:" + err));
      })
    } else {
      api.sendMessage(customPrompt + extraPrompt + question, {
        parentMessageId: doc.data().parentMessageId,
        systemMessage: finalSystemMessage
      }).then((response) => {
        db.collection('users').doc(interaction.user.id).set({
          timeStamp: new Date(),
          userId: interaction.user.id,
          user: interaction.user.tag,
          parentMessageId: response.id
        });
        cb(response);
      }).catch((err) => {
        cb(err);
        console.log(chalk.red("AskQuestion Error:" + err));
      });
    }
  }

  async function splitAndSendResponse(resp, user) {
    while (resp.length > 0) {
      let end = Math.min(process.env.DISCORD_MAX_RESPONSE_LENGTH, resp.length)
      await user.send(resp.slice(0, end))
      resp = resp.slice(end, resp.length)
    }
  }
}
async function splitAndSendChannelResponse(response, channel) {
  // split response into manageable parts and send each part
 

  let part;
  while (response.length > 0) {
      if (response.length > process.env.DISCORD_MAX_RESPONSE_LENGTH) {
          part = response.substring(0, process.env.DISCORD_MAX_RESPONSE_LENGTH);
          response = response.substring(process.env.DISCORD_MAX_RESPONSE_LENGTH);
      } else {
          part = response;
          response = "";
      }
      await channel.send(part);
  }
}




// Discord Rate Limit Check
setInterval(() => {
  axios
    .get('https://discord.com/api/v10')
    .catch(error => {
      if (error.response && error.response.status === 429) {
        console.log("Discord Rate Limited");
        console.warn("Status: " + error.response.status);
        console.warn(error);
        // TODO: Take Action (e.g., Change IP Address)
      }
    });


}, 30000); // Check Every 30 Second

// app.listen(process.env.SERVER_PORT, () => {
//   console.clear();
//   console.log(`Server is running @ http://${process.env.SERVER_HOST}:${process.env.SERVER_PORT}`);
 
// });

main() 


// Call Main function



// ---EoC---