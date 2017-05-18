function waitRedisConnect {
  service=$1
  index=$2
  port=$3

  until docker-compose exec --index=$index $service redis-cli -p $port ping
  do
    sleep 1
  done
}

docker-compose up -d
docker-compose scale sentinel=3
docker-compose scale redis=3

waitRedisConnect redis 1 6379
waitRedisConnect redis 2 6379
waitRedisConnect redis 3 6379

waitRedisConnect sentinel 1 26379
waitRedisConnect sentinel 2 26379
waitRedisConnect sentinel 3 26379

docker-compose exec --index=2 redis redis-cli SLAVEOF dockerredis_redis_1 6379
docker-compose exec --index=3 redis redis-cli SLAVEOF dockerredis_redis_1 6379

docker-compose stop haproxy
docker-compose start haproxy
