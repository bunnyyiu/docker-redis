FROM haproxy:1.7

ENV WORKDIR /root
WORKDIR /root

EXPOSE 6379
EXPOSE 9000

RUN apt-get update && apt-get install -y socat curl bash \
  && rm -rf /var/lib/apt/lists/*

ENV NVM_DIR /usr/local/nvm
ENV NODE_VERSION 6.10.3

SHELL ["/bin/bash", "-c"]

# Install nvm and use it to install node.js
RUN curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.2/install.sh | bash \
      && source $NVM_DIR/nvm.sh \
      && nvm install $NODE_VERSION \
      && nvm alias default $NODE_VERSION \
      && nvm use default

ENV NODE_PATH $NVM_DIR/v$NODE_VERSION/lib/node_modules
ENV PATH $NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

RUN mkdir -p /root/sentinel_monitor/src
COPY sentinel_monitor/src sentinel_monitor/src
COPY sentinel_monitor/package.json sentinel_monitor

COPY haproxy-entrypoint.sh /
RUN chmod +x /haproxy-entrypoint.sh

RUN cd sentinel_monitor; npm install

ENTRYPOINT [ "/haproxy-entrypoint.sh" ]

CMD [ "haproxy", "-f", "/etc/haproxy/haproxy.cfg" ]
