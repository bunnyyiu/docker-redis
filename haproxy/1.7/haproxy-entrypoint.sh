#!/bin/bash

set -ex

echo "=> Creating HAProxy Configuration Folder"
mkdir -p /etc/haproxy

echo "=> Writing HAProxy Configuration File"
cat > /etc/haproxy/haproxy.cfg <<EOF
global
  stats socket $STAT_SOCKET level admin
  stats socket *:$ADMIN_PORT level admin

defaults
  mode tcp
  option tcplog
  option clitcpka
  option srvtcpka
  timeout connect 5s

listen stats
  mode http
  bind :9000
  stats enable
  stats hide-version
  stats realm Haproxy\ Statistics
  stats uri /haproxy_stats
  stats auth $ADMIN_USERNAME:$ADMIN_PASSWORD

frontend ft_redis
  mode tcp
  bind *:6379
  default_backend bk_redis

backend bk_redis
  mode tcp
  option tcpka
  option tcplog
  option tcp-check
  tcp-check send PING\r\n
  tcp-check expect string +PONG
  tcp-check send info\ replication\r\n
  tcp-check expect rstring role:master
  tcp-check send QUIT\r\n
  tcp-check expect string +OK
EOF

echo "=> Adding Redis Nodes to Health Check"
COUNT=1

for i in $(echo $REDIS_HOSTS | sed "s/,/ /g")
do
    echo "  server redis-backend-$COUNT $i:6379 maxconn 1024 check inter 1s" >> /etc/haproxy/haproxy.cfg
    COUNT=$((COUNT + 1))
done

cat >> /etc/haproxy/haproxy.cfg <<EOF

frontend ft_sentinel
  mode tcp
  bind *:26379
  default_backend bk_sentinel

backend bk_sentinel
  mode tcp
  option tcpka
  option tcplog
  option tcp-check
  tcp-check send PING\r\n
  tcp-check expect string +PONG
  tcp-check send QUIT\r\n
  tcp-check expect string +OK
EOF

echo "=> Adding Sentinel Nodes to Health Check"
COUNT=1

for i in $(echo $SENTINEL_HOSTS | sed "s/,/ /g")
do
    echo "  server sentinel-backend-$COUNT $i:26379 maxconn 1024 check inter 1s" >> /etc/haproxy/haproxy.cfg
    COUNT=$((COUNT + 1))
done

echo "=> Starting HAProxy"
exec "/docker-entrypoint.sh" "$@"
