import { google } from 'googleapis';
import { createReadStream } from 'fs';

// Load the service account key file
import t from './stream-safer-af5b8e08cc41.js';


// Configure the API client
const jwtClient = new google.auth.JWT(
  t.client_email,
  null,
  t.private_key,
  ['https://www.googleapis.com/auth/youtube.upload']
);

// Authenticate and upload video
jwtClient.authorize((err, tokens) => {
  if (err) {
    console.error('Error authenticating:', err);
    return;
  }

  const youtube = google.youtube({ version: 'v3', auth: jwtClient });

  const videoMetadata = {
    snippet: {
      title: 'Your Video Title',
      description: 'Your Video Description',
    },
    status: {
      privacyStatus: 'private', // or 'public', 'unlisted'
    },
  };

  const filePath = './Test.webm';

  const requestData = {
    part: 'snippet,status',
    requestBody: videoMetadata,
    media: {
      body: createReadStream(filePath),
    },
  };

  youtube.videos.insert(requestData, (err, res) => {
    if (err) return console.error('The API returned an error:', err.message);

    console.log('Video uploaded:', res.data.snippet.title);
  });
});
