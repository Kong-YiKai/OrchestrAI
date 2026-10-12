# Build pgvector against the same PostgreSQL distribution used at runtime.
FROM postgres:16-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea AS vector-build
RUN apk add --no-cache build-base wget
RUN wget -q https://codeload.github.com/pgvector/pgvector/tar.gz/f37c13f68b57d2c3472b2214fbcff699d6d34876 -O /tmp/vector.tar.gz && \
    echo '83d673c3b287cddbf3879f86215f043f2c2b56c69d37b2a77504910db1ed6e56  /tmp/vector.tar.gz' | sha256sum -c - && \
    mkdir /tmp/vector && tar -xzf /tmp/vector.tar.gz -C /tmp/vector --strip-components=1 && \
    make -C /tmp/vector OPTFLAGS='' with_llvm=no && make -C /tmp/vector install with_llvm=no
FROM postgres:16-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea AS postgres
COPY --from=vector-build /usr/local/lib/postgresql/vector.so /usr/local/lib/postgresql/
COPY --from=vector-build /usr/local/share/postgresql/extension/vector* /usr/local/share/postgresql/extension/
# Start as postgres directly: the root-to-user helper is unnecessary and carries
# an obsolete Go runtime. Official init scripts still run as the database owner.
RUN rm /usr/local/bin/gosu
USER postgres

FROM redis:7.4-alpine@sha256:858f009f9709ce576febc734aa78b8f6d624b82571f9ddb6bda4377c833b3499 AS redis
RUN apk add --no-cache libcrypto3=3.3.7-r2 libssl3=3.3.7-r2
