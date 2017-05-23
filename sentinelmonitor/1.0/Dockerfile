FROM node:6

ENV WORKDIR /root
WORKDIR /root

RUN apt-get update && apt-get install -y socat && apt-get clean

RUN mkdir -p /root/sentinel_monitor/src
COPY sentinel_monitor/package.json sentinel_monitor
COPY sentinel_monitor/src sentinel_monitor/src

RUN cd sentinel_monitor; npm install --production
CMD ["node", "/root/sentinel_monitor/src/monitor.js"]
