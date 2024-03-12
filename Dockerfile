FROM node:18

# Install FFmpeg
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean

WORKDIR /stream-safer

COPY ./package*.json /stream-safer/

RUN npm install

COPY . /stream-safer

# serve
CMD [ "sh", "-c", "node index.js" ]