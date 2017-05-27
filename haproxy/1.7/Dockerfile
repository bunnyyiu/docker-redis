FROM haproxy:1.7

ENV WORKDIR /root
WORKDIR /root

EXPOSE 6379
EXPOSE 9000
EXPOSE 9001

RUN apt-get update && apt-get install -y socat curl bash \
  && rm -rf /var/lib/apt/lists/*

ENV STAT_SOCKET /var/run/haproxy.sock
ENV ADMIN_PORT 9001

COPY haproxy-entrypoint.sh /
RUN chmod +x /haproxy-entrypoint.sh

ENTRYPOINT [ "/haproxy-entrypoint.sh" ]

CMD [ "haproxy", "-f", "/etc/haproxy/haproxy.cfg" ]
