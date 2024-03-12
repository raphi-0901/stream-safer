import ffmpeg from 'fluent-ffmpeg';

const args = process.argv;

// Checking if the correct number of arguments are provided
if (args.length !== 4) {
    console.log("Usage: node node_script.js <string> <number>");
    process.exit(1); // Exit with a non-zero status code to indicate failure
}

// Extracting input parameters
const vlcStreamUrl = args[2];
const outputFilename = args[3];

console.log('vlcStreamUrl :>> ', vlcStreamUrl);
console.log('outputFilename :>> ', outputFilename);

// Start capturing the VLC stream and save it as an MP4 file
ffmpeg(vlcStreamUrl)
  .output(outputFilename)
  .on('end', function() {
    console.log('Conversion complete');
  })
  .on('error', function(err) {
    console.log('Error:', err);
  })
  .run();