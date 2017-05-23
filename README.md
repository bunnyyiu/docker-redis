# High Availability Redis
This `docker-compose.yml` is based on `redis:3` and `haproxy:1.7`. It creates a three node Redis cluster with [redis-sentinel](https://redis.io/topics/sentinel) and haproxy. The proxy node will always route traffic to the current master node. Sentinel will handle automation failover.

## Running the Cluster
```bash
docker network create bridge redisha
docker-compose up -d
```
