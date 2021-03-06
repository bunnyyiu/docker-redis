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
const haproxySock = process.env.HAPROXY_SOCK || ` socat - TCP4:${haproxyHost}:9001`;
const sentinelPort = parseInt(process.env.SENTINEL_PORT || 26379, 10);

if (!process.env.SENTINEL_HOST) {
  console.error('Please set environment variables SENTINEL_HOST');
  process.exit(1);
}

sentinelHost = process.env.SENTINEL_HOST;

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
  return childProcess.execAsync(cmd).then(function(server) {
      return server.trim();
  });
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
  }).then(function(host) {
    return enableServerAsync(host);
  });
};

let client = null;

Promise.resolve().then(function() {
  const pubsubClient = redis.createClient({
    host: sentinelHost,
    port: sentinelPort,
    retry_strategy: function(options) {
      return Math.min(options.attempt * 100, 3000);
    }
  });

  bluebird.promisifyAll(pubsubClient);
  return pubsubClient;
}).then(function(pubsubClient) {
  // Get current master and disbale other redis clients
  const sentinelCmd = ['get-master-addr-by-name', 'docker-cluster'];
  return pubsubClient.sendCommandAsync('SENTINEL', sentinelCmd)
  .then(function(masterInfo) {
    if (!masterInfo || masterInfo.length !== 2) {
      return Promise.reject(new Error('Error in getting current master'));
    }

    console.log(`The current master is ${masterInfo[0]}`);
    return rebootAsync(masterInfo[0]);
  })
  .then(function() {
    return pubsubClient;
  });
}).then(function(pubsubClient) {
  pubsubClient.on('pmessage', function(pattern, channel, msg) {
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

  pubsubClient.on('error', function(err) {
    console.error(err);
  });

  pubsubClient.psubscribe('*');
  client = pubsubClient;
}).catch(function(err) {
  console.error('Error in making redis connection', err);
  console.error('The process will now exit');
  process.nextTick(gracefulExit);
});

const gracefulExit = function() {
  if (client) {
    client.punsubscribe('*');
    client.quit();
    client = null;
  }
  process.exit(0);
};

process.on('uncaughtException', function(err) {
  console.error('uncaughtException', err);
  process.nextTick(gracefulExit);
});

process.on('unhandledRejection', function(reason, p) {
  console.error('unhandledRejection', p, reason);
  process.nextTick(gracefulExit);
});

process.on('SIGINT', function() {
  console.error('Received SIGINT, the program will now exit.');
  process.nextTick(gracefulExit);
});
