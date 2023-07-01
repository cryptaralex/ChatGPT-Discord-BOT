import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import axios from 'axios';
//import { apiKey, imagineURL } from '../config.json';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const getImage = async messageId => {
  const url = `${process.env.IMAGINE_URL}message/${messageId}`;
  const config = {
    method: 'get',
    url,
    headers: {
      Authorization: `Bearer ${process.env.TNL_API_KEY}`,
    },
  };

  let res;

  await axios(config)
    .then(response => {
      res = response.data;
    })
    .catch(error => {
      console.log('error with axios get');
      res = 'error';
    });

  return res;
};

export const execute = async interaction => {
  try {
    const { customId, channel, user } = interaction;

    if (customId) {
      await interaction.reply(`You clicked button-${customId}`);
      const buttonInfo = customId.split("#");
      const data = JSON.stringify({
        button: buttonInfo[2],
        buttonMessageId: buttonInfo[1],
        ref: '',
        webhookOverride: '',
      });

      const config = {
        method: 'post',
        url: `${process.env.IMAGINE_URL}button`,
        headers: {
          Authorization: `Bearer ${process.env.TNL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        data,
      };

      try {
        const response = await axios(config);
        if (response.data.success) {
          const { messageId } = response.data;
          if (messageId) {
            let progress = 0;
            let images;

            while (progress.toString() !== '100') {
              await sleep(10000);
              images = await getImage(messageId);
              console.log(
                `${customId} button.image.progress:
                ${images.progress}`
              );
              progress = images.progress;
              await interaction.editReply(
                `${images.progress}% <@${user.id}>`
              );
            }

            if (images.progress.toString() === '100') {
              await interaction.editReply(
                `The result of clicking ${buttonInfo[2]} button - <@${user.id}>`
              );
              const { imageUrl } = images.response;
              if (imageUrl) {
                await interaction.channel.send(imageUrl);
              }
            }
          }
        }
      } catch (error) {
        console.log('Error with axios using imagine button.');
      }
    } else {
      await interaction.reply(`There is no custom.`);
    }
    return;
  } catch (error) {
    return interaction.reply('Error with clicking button.');
  }
};
