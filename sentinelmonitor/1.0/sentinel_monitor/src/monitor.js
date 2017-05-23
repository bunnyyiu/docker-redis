'use strict';

const dns = require('dns');
const redis = require('redis');
const bluebird = require('bluebird');
const childProcess = require('child_process');

bluebird.promisifyAll(dns);
bluebird.promisifyAll(childProcess);

let sentinelHost = null;

const backendName = 'bk_redis';
const haproxyHost = process.env.HAPROXY_HOST || 'redisproxy';
const haproxySock = process.env.HAPROXY_SOCK || ` socat - TCP4:${redisproxy}:9001`;
const sentinelPort = parseInt(process.env.SENTINEL_PORT || 26379, 10);

if (!process.env.SENTINEL_HOST) {
  console.error('Please set environment variables SENTINEL_HOST');
  process.exit(1);
}

sentinelHost = process.env.SENTINEL_HOST;

const client = redis.createClient({
  host: sentinelHost,
  port: sentinelPort,
  retry_strategy: function(options) {
    return Math.min(options.attempt * 100, 3000);
  }
});

const enableServerAsync = function(server) {
  const cmd = `echo enable server ${backendName}/${server} | ${haproxySock}`;
  console.log(cmd);
  return childProcess.execAsync(cmd);
};

const disableServerAsync = function(server) {
  const cmd = `echo disable server ${backendName}/${server} | ${haproxySock}`;
  console.log(cmd);
  return childProcess.execAsync(cmd);
};

const resolveServer = function(ip) {
  const cmd = `echo show servers state | ${haproxySock} | grep "${backendName}" |
  grep "${ip}" | awk '{print $4}'`;
  console.log(cmd);
  return childProcess.execAsync(cmd).then(function (server) {
      return server.trim();
  });;
};

const getALlServersAsync = function() {
  const cmd = `echo show servers state | ${haproxySock} | grep "${backendName}" |
  awk '{print $4}'`;
  console.log(cmd);
  return childProcess.execAsync(cmd);
};

const switchMasterAsync = function(oldMaster, newMaster) {
  return Promise.all([
    resolveServer(oldMaster),
    resolveServer(newMaster)
  ]).then(function(hosts) {
    return disableServerAsync(hosts[0]).then(function() {
      return enableServerAsync(hosts[1]);
    });
  });
};

const failoverAsync = function() {
  return getALlServersAsync().then(function(hosts) {
    return hosts.trim().split('\n');
  }).then(function(hosts) {
    return Promise.all(hosts.map(function(host) {
      return disableServerAsync(host);
    }));
  });
};

const rebootAsync = function(master) {
  return failoverAsync().then(function() {
    return resolveServer(master);
  }).then(function (host) {
    return enableServerAsync(host);
  });
};

client.on('pmessage', function(pattern, channel, msg) {
  console.log(channel, msg);
  if (channel === '+switch-master') {
    const params = msg.split(' ');
    // Disable the old master and enable the new master
    switchMasterAsync(params[1], params[3]).catch(console.error);
  } else if (channel === '+try-failover') {
    const params = msg.split(' ');
    // Disable access to old master and block all external access
    failoverAsync(params[2]).catch(console.error);
  } else if (channel === '+reboot') {
    const params = msg.split(' ');
    if (params[0] === 'master') {
      rebootAsync(params[2]).catch(console.error);
    }
  }
});

client.on('error', function(err) {
  console.error(err);
});

client.psubscribe('*');
