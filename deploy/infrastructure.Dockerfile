# Fixed upstream distributions, with only the security fixes needed by R2.
FROM postgres:16-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea AS postgres
# Start as postgres directly: the root-to-user helper is unnecessary and carries
# an obsolete Go runtime. Official init scripts still run as the database owner.
RUN rm /usr/local/bin/gosu
USER postgres

FROM redis:7.4-alpine@sha256:858f009f9709ce576febc734aa78b8f6d624b82571f9ddb6bda4377c833b3499 AS redis
RUN apk add --no-cache libcrypto3=3.3.7-r2 libssl3=3.3.7-r2
