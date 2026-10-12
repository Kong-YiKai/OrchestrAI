# Retain MongoDB's fixed server version; update its administrative tools and TLS.
FROM mongo:8.0.20@sha256:098862b1339f031900ca66cf8fef799e616d6324fa41b9a263f2ec899552c1ef
ARG BUILD_REVISION=local
LABEL org.opencontainers.image.revision=$BUILD_REVISION
LABEL org.opencontainers.image.source="https://github.com/Kong-YiKai/OrchestrAI"
RUN apt-get update && apt-get install -y --no-install-recommends \
    mongodb-database-tools=100.19.1 mongodb-mongosh=2.13.0 \
    libssl3t64=3.0.13-0ubuntu3.16 openssl=3.0.13-0ubuntu3.16 && \
    rm -rf /var/lib/apt/lists/* /opt/js-yaml && rm -f /js-yaml.js /usr/local/bin/gosu && \
    rm /usr/bin/bsondump /usr/bin/mongoexport /usr/bin/mongofiles /usr/bin/mongoimport /usr/bin/mongostat /usr/bin/mongotop
# Only dump/restore are needed. The unused legacy YAML-config loader is removed;
# OrchestrAI configures mongod by fixed Compose arguments, not YAML files.
# Official volume directories already belong to UID 999. Skip the root/gosu
# branch; official initialization and Mongo auth still run unchanged.
USER mongodb
