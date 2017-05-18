#!/bin/bash

set -ex

echo "=> Creating HAProxy Configuration Folder"
mkdir -p /etc/haproxy


echo "=> Writing HAProxy Configuration File"
tee /etc/haproxy/haproxy.cfg <<EOF
global
  stats socket /etc/haproxy/haproxysock level admin

defaults
  mode tcp
  timeout connect 3s
  timeout server 6s
  timeout client 6s

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
  option tcplog
  option tcp-check
  #uncomment these lines if you have basic auth
  #tcp-check send AUTH\ yourpassword\r\n
  #tcp-check expect +OK
  tcp-check send PING\r\n
  tcp-check expect string +PONG
  #tcp-check send ROLE\r\n
  #tcp-check expect rstring master
  tcp-check send info\ replication\r\n
  tcp-check expect rstring role:master
  tcp-check send QUIT\r\n
  tcp-check expect string +OK
EOF

echo "=> Adding Redis Nodes to Health Check"
COUNT=1

for i in $(echo $REDIS_HOSTS | sed "s/,/ /g")
do
    # call your procedure/other scripts here below
    echo "  server redis-backend-$COUNT $i:6379 maxconn 1024 check inter 1s rise 5" >> /etc/haproxy/haproxy.cfg
    COUNT=$((COUNT + 1))
done

pushd /root/sentinel_monitor
source $NVM_DIR/nvm.sh
node /root/sentinel_monitor/src/monitor.js &
popd

echo "=> Starting HAProxy"
exec "/docker-entrypoint.sh" "$@"
