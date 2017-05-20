'use strict';

const dns = require('dns');
const redis = require('redis');
const bluebird = require('bluebird');
const childProcess = require('child_process');

bluebird.promisifyAll(dns);
bluebird.promisifyAll(childProcess);

let sentinelName = null;
let redisHosts = null;

const backendName = 'bk_redis';
const haproxySock = '/etc/haproxy/haproxysock';
const haproxyConfig = '/etc/haproxy/haproxy.cfg';

if (!process.env.SENTINEL_NAME || !process.env.REDIS_HOSTS) {
  console.error('Please set environment variables SENTINEL_NAME, REDIS_HOSTS');
  process.exit(1);
}

const sentinelPort = parseInt(process.env.SENTINEL_PORT || 26379, 10);

sentinelName = process.env.SENTINEL_NAME;
redisHosts = process.env.REDIS_HOSTS.split(',');

const ipHost = {};

Promise.all(redisHosts.map(function (host) {
  return dns.resolveAsync(host);
})).then(function (ips) {
  ips.forEach(function(ip, i) {
    ipHost[ip[0]] = redisHosts[i];
  });
}).catch(function (err) {
  console.error('Failure to resolve IP', err);
  process.exit(-1);
});

const client = redis.createClient({
  host: sentinelName,
  port: sentinelPort,
  retry_strategy: function(options) {
    return Math.min(options.attempt * 100, 3000);
  }
});

const enableServerAsync = function(server) {
  const cmd = `echo enable server ${backendName}/${server} | \
    socat stdio ${haproxySock}`;
  console.log(cmd);
  return childProcess.execAsync(cmd);
};

const disableServerAsync = function(server) {
  const cmd = `echo disable server ${backendName}/${server} | \
    socat stdio ${haproxySock}`;
  console.log(cmd);
  return childProcess.execAsync(cmd);
};

const resolveServer = function(ip) {
  const host = ipHost[ip];
  if (!host) {
    return Promise.reject(new Error(`Unrecognized ip ${ip}`));
  }
  const cmd = `cat ${haproxyConfig} | \
    grep ${host} | awk '{print $2}'`;
  return childProcess.execAsync(cmd).then(function(server) {
    return server.trim();
  });
};

const switchMasterAsync = function(oldMaster, newMaster) {
  return Promise.all([
    resolveServer(oldMaster),
    resolveServer(newMaster)
  ]).then(function(hosts) {
    return disableServerAsync(hosts[0])
    .then(function() {
      return enableServerAsync(hosts[1]);
    });
  });
};

const failoverAsync = function() {
  return Promise.all(Object.keys(ipHost).map(function(ip) {
    return resolveServer(ip);
  })).then(function(hosts) {
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
